package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"math"
	"math/rand/v2"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"
)

// shortcut: one player saved to a JSON file; add users and a database for multiplayer.
const (
	startBalance = 100_00 // R$ 100,00 — all money is in centavos
	saveFile     = "save.json"
	historySize  = 10
	formSize     = 5     // finishing positions remembered per roster horse
	dailyBonus   = 20_00 // R$ 20,00 once per calendar day
	levelReward  = 10_00 // R$ 10,00 × the level reached
)

// horses each bet type needs, in order
var picksNeeded = map[string]int{"win": 1, "place": 1, "dupla": 2, "exata": 2, "trifeta": 3}

type HistoryItem struct {
	Race   int    `json:"race"`
	Horse  string `json:"horse"`
	Type   string `json:"type"`
	Amount int    `json:"amount"`
	Payout int    `json:"payout"`
}

type Stats struct {
	Bets     int           `json:"bets"`
	Wins     int           `json:"wins"`
	Staked   int           `json:"staked"`
	Returned int           `json:"returned"`
	BestWin  int           `json:"bestWin"`
	Streak   int           `json:"streak"` // current run of winning bets
	Best     int           `json:"bestStreak"`
	History  []HistoryItem `json:"history"`
	Unlocked []string      `json:"achievements"`
	Surfaces []string      `json:"surfacesWon"` // surfaces with at least one winning bet
	XP       int           `json:"xp"`
}

// saved is what survives a server restart.
type saved struct {
	Balance int   `json:"balance"`
	RaceID  int   `json:"raceId"`
	Stats   Stats `json:"stats"`
	// Day ("2006-01-02", server local time) the daily bonus was last claimed.
	LastBonus  string        `json:"lastBonus"`
	RosterSeed uint64        `json:"rosterSeed"` // rebuilds the same 30 horses after a restart
	Form       map[int][]int `json:"form"`       // roster index → last finishing positions, most recent first
	Missions   Missions      `json:"missions"`
}

type game struct {
	mu       sync.Mutex
	rng      *rand.Rand
	savePath string // empty = no persistence (tests)
	saved
	roster []Profile
	race   Race
}

type betRequest struct {
	RaceID  int    `json:"raceId"`
	HorseID int    `json:"horseId"`
	Horse2  int    `json:"horse2"` // 2nd pick: dupla, exata, trifeta
	Horse3  int    `json:"horse3"` // 3rd pick: trifeta
	Amount  int    `json:"amount"`
	Type    string `json:"type"` // "win", "place", "dupla", "exata" or "trifeta"
}

type betResponse struct {
	Result
	WinnerID      int      `json:"winnerId"`
	Won           bool     `json:"won"`
	Payout        int      `json:"payout"`
	Balance       int      `json:"balance"`
	TickMs        int      `json:"tickMs"`
	Stats         Stats    `json:"stats"`
	Gap           float64  `json:"gap"`           // metres between 1st and 2nd at the line
	New           []string `json:"unlocked"`      // achievements unlocked by this bet
	LevelUp       int      `json:"levelUp"`       // new level reached by this bet, 0 if none
	LevelReward   int      `json:"levelReward"`   // centavos credited for the level(s) gained
	MissionsDone  []string `json:"missionsDone"`  // daily missions completed by this bet
	MissionReward int      `json:"missionReward"` // centavos credited for them
}

func (g *game) state() map[string]any {
	return map[string]any{
		"raceId": g.RaceID, "horses": g.race.Horses, "going": g.race.Going, "surface": g.race.Surface,
		"distance": g.race.Distance, "night": g.race.Night, "gp": g.race.GP,
		"duplaOdds": g.race.Dupla, "exataOdds": g.race.Exata, "trifetaOdds": g.race.Trifeta,
		"balance": g.Balance, "stats": g.Stats, "missions": g.Missions.List,
		"bonusAvailable": g.LastBonus != today(), "bonusAmount": dailyBonus,
		"nextGP": (gpEvery - g.RaceID%gpEvery) % gpEvery, // races until the Grande Prêmio; 0 = this one
	}
}

func today() string { return time.Now().Format("2006-01-02") }

// level for an XP total: level n starts at 50·n·(n−1) XP (0, 100, 300, 600, 1000, …).
func level(xp int) int {
	l := 1
	for xp >= 50*l*(l+1) {
		l++
	}
	return l
}

// claimBonus credits the daily bonus once per day. Caller holds g.mu.
func (g *game) claimBonus(day string) string {
	if g.LastBonus == day {
		return "bônus de hoje já foi resgatado"
	}
	g.LastBonus = day
	g.Balance += dailyBonus
	return ""
}

// nextRace enters roster horses for the current race id and attaches their recent form. Caller holds g.mu.
func (g *game) nextRace() {
	g.race = newRace(g.rng, g.roster, g.RaceID)
	for i := range g.race.Horses {
		g.race.Horses[i].Form = g.Form[g.race.Horses[i].Roster]
	}
}

func (g *game) handleRace(w http.ResponseWriter, r *http.Request) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.ensureMissions(today()) {
		g.save()
	}
	writeJSON(w, http.StatusOK, g.state())
}

func (g *game) handleBet(w http.ResponseWriter, r *http.Request) {
	var req betRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pedido inválido"})
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	resp, errMsg := g.placeBet(req)
	if errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	g.save()
	writeJSON(w, http.StatusOK, resp)
}

// placeBet validates, runs the race on the server and settles the bet. Caller holds g.mu.
func (g *game) placeBet(req betRequest) (betResponse, string) {
	if req.RaceID != g.RaceID {
		return betResponse{}, "essa corrida já terminou"
	}
	need, ok := picksNeeded[req.Type]
	if !ok {
		return betResponse{}, "tipo de aposta inválido"
	}
	picks := []int{req.HorseID, req.Horse2, req.Horse3}[:need]
	for i, p := range picks {
		if p < 0 || p >= len(g.race.Horses) {
			return betResponse{}, "cavalo inexistente"
		}
		if slices.Contains(picks[:i], p) {
			return betResponse{}, "escolha cavalos diferentes"
		}
	}
	if req.Amount <= 0 || req.Amount > g.Balance {
		return betResponse{}, "valor de aposta inválido"
	}
	g.ensureMissions(today())
	var names []string
	for _, p := range picks {
		names = append(names, g.race.Horses[p].Name)
	}
	allIn := req.Amount == g.Balance
	g.Balance -= req.Amount
	res := simulate(&g.race, g.rng, true)
	resp := betResponse{Result: res, WinnerID: res.Order[0], TickMs: tickMs, Gap: finishGap(res, g.race.Distance)}
	horse := g.race.Horses[req.HorseID]
	var odds float64
	var won bool
	sep := " → " // ordered bets
	switch req.Type {
	case "win":
		odds, won = horse.Odds, res.Order[0] == picks[0]
	case "place":
		odds, won = horse.Place, slices.Contains(res.Order[:2], picks[0])
	case "dupla":
		odds = g.race.Dupla[duplaKey(picks[0], picks[1])]
		won = duplaKey(res.Order[0], res.Order[1]) == duplaKey(picks[0], picks[1])
		sep = " + "
	case "exata":
		odds, won = g.race.Exata[exataKey(picks[0], picks[1])], slices.Equal(res.Order[:2], picks)
	case "trifeta":
		odds, won = g.race.Trifeta[trifetaKey(picks[0], picks[1], picks[2])], slices.Equal(res.Order[:3], picks)
	}
	if won {
		resp.Won = true
		resp.Payout = payout(req.Amount, odds)
		g.Balance += resp.Payout
	}

	// The roster remembers where each horse finished.
	for pos, id := range res.Order {
		rid := g.race.Horses[id].Roster
		g.Form[rid] = append([]int{pos + 1}, g.Form[rid]...)[:min(len(g.Form[rid])+1, formSize)]
	}

	s := &g.Stats
	s.Bets++
	s.Staked += req.Amount
	s.Returned += resp.Payout
	if resp.Won {
		s.Wins++
		s.BestWin = max(s.BestWin, resp.Payout)
		s.Streak++
		if !slices.Contains(s.Surfaces, g.race.Surface) {
			s.Surfaces = append(s.Surfaces, g.race.Surface)
		}
		s.Best = max(s.Best, s.Streak)
	} else {
		s.Streak = 0
	}
	s.History = append([]HistoryItem{{g.RaceID, strings.Join(names, sep), req.Type, req.Amount, resp.Payout}}, s.History...)
	s.History = s.History[:min(len(s.History), historySize)]

	// Achievement IDs; the front-end owns their titles and icons.
	for id, ok := range map[string]bool{
		"first_win":  resp.Won,
		"zebra":      resp.Won && odds >= 10,
		"photo":      resp.Won && resp.Gap < 3,
		"streak3":    s.Streak >= 3,
		"double":     g.Balance >= 2*startBalance,
		"allin":      resp.Won && allIn,
		"mud":        resp.Won && g.race.Going == "pesada",
		"barro":      resp.Won && g.race.Going != "seca" && g.race.Surface == "terra",
		"dupla":      resp.Won && req.Type == "dupla",
		"marathon":   resp.Won && g.race.Distance >= 1600,
		"all_tracks": len(s.Surfaces) == len(surfaces),
		"regular":    s.Bets >= 25,
		"gp":         resp.Won && g.race.GP,
		"trifeta":    resp.Won && req.Type == "trifeta",
	} {
		if ok && !slices.Contains(s.Unlocked, id) {
			s.Unlocked = append(s.Unlocked, id)
			resp.New = append(resp.New, id)
		}
	}

	// Daily missions pay money and XP.
	resp.MissionsDone = g.progressMissions(betOutcome{kind: req.Type, won: resp.Won, odds: odds, race: &g.race})
	resp.MissionReward = missionReward * len(resp.MissionsDone)
	g.Balance += resp.MissionReward

	// XP: 10 per bet, more for wins and long shots, doubled in the Grande Prêmio. Each new level pays R$ 10 × level.
	before := level(s.XP)
	xp := 10
	if resp.Won {
		xp += 15 + int(odds*5)
	}
	if g.race.GP {
		xp *= 2
	}
	s.XP += xp + missionXP*len(resp.MissionsDone)
	for l := before + 1; l <= level(s.XP); l++ {
		resp.LevelUp = l
		resp.LevelReward += levelReward * l
	}
	g.Balance += resp.LevelReward

	resp.Balance, resp.Stats = g.Balance, g.Stats
	g.RaceID++
	g.nextRace()
	return resp, ""
}

// save writes atomically (temp file + rename) so a crash never leaves a half-written save. Caller holds g.mu.
func (g *game) save() {
	if g.savePath == "" {
		return
	}
	data, _ := json.Marshal(g.saved)
	tmp := g.savePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		log.Println("erro ao salvar:", err)
		return
	}
	if err := os.Rename(tmp, g.savePath); err != nil {
		log.Println("erro ao salvar:", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func newGame(savePath string) *game {
	rng := rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64()))
	g := &game{rng: rng, savePath: savePath, saved: saved{Balance: startBalance, RaceID: 1}}
	if savePath != "" {
		data, err := os.ReadFile(savePath)
		if err == nil {
			err = json.Unmarshal(data, &g.saved)
		}
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			log.Fatalf("save corrompido (%s): %v — apague o arquivo para recomeçar", savePath, err)
		}
	}
	if g.RosterSeed == 0 { // new game, or a save from before the roster existed
		g.RosterSeed = rng.Uint64() | 1
	}
	if g.Form == nil {
		g.Form = map[int][]int{}
	}
	g.roster = newRoster(g.RosterSeed)
	g.nextRace()
	g.save()
	return g
}

func main() {
	g := newGame(saveFile)
	http.HandleFunc("GET /api/race", g.handleRace)
	http.HandleFunc("POST /api/bet", g.handleBet)
	http.HandleFunc("POST /api/reset", func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		g.Balance = startBalance
		g.save()
		writeJSON(w, http.StatusOK, g.state())
	})
	http.HandleFunc("POST /api/bonus", func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		if msg := g.claimBonus(today()); msg != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
			return
		}
		g.save()
		writeJSON(w, http.StatusOK, g.state())
	})
	http.Handle("/", http.FileServer(http.Dir("../frontend/dist"))) // serves the built front-end
	log.Println("servidor em http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// payout in centavos, rounded to the nearest centavo (float odds like 1.05 aren't exact).
func payout(amount int, odds float64) int { return int(math.Round(float64(amount) * odds)) }
