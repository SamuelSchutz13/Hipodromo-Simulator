package main

import (
	"fmt"
	"math"
	"math/rand/v2"
)

const (
	tickMs      = 100 // each frame represents 100ms of race time
	houseMargin = 0.10
	cruise      = 10.0 // average distance per tick at full speed
	rosterSize  = 30   // horses in the stable; 10 of each trait
	gpEvery     = 10   // every 10th race is the Grande Prêmio
	gpDistance  = 2400.0
)

// Profile is a horse of the permanent roster: name, coat, trait and hidden ability never change.
type Profile struct {
	Name                        string
	Coat                        string
	Trait                       int    // 0 likes mud, 1 surface specialist, 2 stayer
	Pref                        string // preferred surface (specialists only)
	speed, stamina, accel, kick float64
	mud                         float64 // speed multiplier on soft ground at full weight
	spec                        float64 // surface fit on its preferred surface
}

type Jockey struct {
	Name  string
	Color string  // silk
	skill float64 // small speed multiplier
}

// Stars shows jockey skill as 1 to 5 stars.
func (j Jockey) Stars() int { return max(1, min(5, int(math.Round((j.skill-0.98)/0.0075)))) }

// Horse is a roster horse entered in a race, with its jockey and odds for that race.
type Horse struct {
	ID          int     `json:"id"` // lane, 0-based
	Roster      int     `json:"rosterId"`
	Name        string  `json:"name"`
	Color       string  `json:"color"` // jockey silk
	Coat        string  `json:"coat"`  // horse body colour
	Jockey      string  `json:"jockey"`
	JockeyStars int     `json:"jockeyStars"`
	Form        []int   `json:"form"`      // last finishing positions, most recent first
	Odds        float64 `json:"odds"`      // win
	Place       float64 `json:"placeOdds"` // finishes 1st or 2nd
	Mudder      bool    `json:"mudder"`    // public hint: likes soft ground
	Specialist  bool    `json:"specialist"`
	Pref        string  `json:"pref"`   // the specialist's favourite surface
	Stayer      bool    `json:"stayer"` // public hint: lots of stamina
	// Hidden from players; they only see the odds and hints.
	speed   float64 // top speed multiplier (horse × jockey)
	stamina float64 // metres run before tiring
	accel   float64 // how fast it reaches the target speed
	kick    float64 // final sprint multiplier
	ground  float64 // speed multiplier from the surface, the ground and how this horse handles them
}

type Race struct {
	Horses   []Horse            `json:"horses"`
	Surface  string             `json:"surface"`
	Going    string             `json:"going"`
	Distance float64            `json:"distance"`
	Night    bool               `json:"night"`       // floodlit evening race; visual only
	GP       bool               `json:"gp"`          // Grande Prêmio: 8 horses, 2400 m, no house margin
	Dupla    map[string]float64 `json:"duplaOdds"`   // "a-b" (a<b): both finish 1st and 2nd, any order
	Exata    map[string]float64 `json:"exataOdds"`   // "a>b": a 1st, b 2nd
	Trifeta  map[string]float64 `json:"trifetaOdds"` // "a>b>c": a 1st, b 2nd, c 3rd
}

type Result struct {
	Frames [][]float64 `json:"frames"` // frames[t][i] = distance run by horse i at tick t
	Order  []int       `json:"order"`  // horse IDs in finishing order
}

var (
	firstNames = []string{
		"Relâmpago", "Trovão", "Furacão", "Cometa", "Vento", "Raio", "Tufão", "Tornado", "Corisco",
		"Barão", "Duque", "Príncipe", "Rei", "Cacique", "Fogo", "Luar", "Sol", "Valente", "Gaúcho",
		"Pingo", "Faro", "Imperador", "Guerreiro", "Xodó", "Trovador", "Ciclone", "Diamante", "Mustang",
	}
	lastNames = []string{
		"do Sul", "Negro", "de Prata", "Dourado", "Selvagem", "do Norte", "Veloz", "Real", "da Serra",
		"Imperial", "Bravo", "do Pampa", "de Fogo", "Noturno", "Azul", "Invicto", "da Aurora",
		"Lendário", "de Ouro", "do Vale", "Feroz", "da Colina", "Indomável", "Ligeiro",
	}
	jockeys = []Jockey{
		{"J. Moreira", "#e11d48", 1.015}, {"A. Lima", "#2563eb", 1.01}, {"C. Souza", "#16a34a", 1.005},
		{"R. Duarte", "#f59e0b", 1.0}, {"M. Rocha", "#9333ea", 1.0}, {"F. Prado", "#0891b2", 0.995},
		{"L. Teixeira", "#db2777", 0.99}, {"P. Barros", "#65a30d", 0.985},
	}
	coats = []string{"#6b3e1f", "#3b2414", "#1c1917", "#8a5a33", "#a8a29e", "#d6c3a5", "#4a2c17"}
	// Ground condition: weight 0 = no effect, 1 = full effect of each horse's mud preference.
	goings = []struct {
		Name   string
		Weight float64
	}{{"seca", 0}, {"seca", 0}, {"molhada", 0.5}, {"pesada", 1}}
	// Surface: base speed, and how much rain changes it (dirt turns into heavy mud).
	surfaces = []struct {
		Name  string
		Speed float64
		Rain  float64
	}{{"grama", 1.0, 1.0}, {"areia", 0.97, 0.7}, {"terra", 0.98, 1.6}}
	distances = []float64{800, 1000, 1200, 1600}
)

func duplaKey(a, b int) string      { return fmt.Sprintf("%d-%d", min(a, b), max(a, b)) }
func exataKey(a, b int) string      { return fmt.Sprintf("%d>%d", a, b) }
func trifetaKey(a, b, c int) string { return fmt.Sprintf("%d>%d>%d", a, b, c) }

// newRoster builds the permanent stable from a seed, so it is identical after every restart.
func newRoster(seed uint64) []Profile {
	rng := rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))
	roster := make([]Profile, rosterSize)
	used := map[string]bool{}
	for i := range roster {
		name := ""
		for name == "" || used[name] {
			name = firstNames[rng.IntN(len(firstNames))] + " " + lastNames[rng.IntN(len(lastNames))]
		}
		used[name] = true
		p := Profile{
			Name: name, Coat: coats[rng.IntN(len(coats))], Trait: i % 3,
			speed:   0.975 + rng.Float64()*0.05,
			accel:   0.08 + rng.Float64()*0.08,
			kick:    1.0 + rng.Float64()*0.07,
			mud:     0.96 + rng.Float64()*0.06, // up to 1.02
			stamina: 800 + rng.Float64()*500,   // up to 1300
		}
		// Each hidden value is drawn from the "strong" range only for the horse's own trait.
		switch p.Trait {
		case 0:
			p.mud = 1.02 + rng.Float64()*0.02
		case 1:
			p.Pref = surfaces[rng.IntN(len(surfaces))].Name
			p.spec = 1.015 + rng.Float64()*0.01
		case 2:
			p.stamina = 1300 + rng.Float64()*200
		}
		roster[i] = p
	}
	return roster
}

// newRace enters horses from the roster (2 of each trait; 3/3/2 in the Grande Prêmio), gives each a jockey,
// draws surface, ground and distance, then prices every bet by Monte Carlo.
func newRace(rng *rand.Rand, roster []Profile, raceID int) Race {
	gp := raceID%gpEvery == 0
	going := goings[rng.IntN(len(goings))]
	surface := surfaces[rng.IntN(len(surfaces))]
	race := Race{
		Surface: surface.Name, Going: going.Name, Distance: distances[rng.IntN(len(distances))],
		Night: rng.IntN(4) == 0, GP: gp,
		Dupla: map[string]float64{}, Exata: map[string]float64{}, Trifeta: map[string]float64{},
	}
	counts := [3]int{2, 2, 2}
	if gp {
		race.Distance = gpDistance
		counts = [3]int{3, 3, 3}
		counts[rng.IntN(3)] = 2
	}
	var groups [3][]int
	for i, p := range roster {
		groups[p.Trait] = append(groups[p.Trait], i)
	}
	var entered []int
	for t, n := range counts {
		perm := rng.Perm(len(groups[t]))
		for k := range n {
			entered = append(entered, groups[t][perm[k]])
		}
	}
	rng.Shuffle(len(entered), func(a, b int) { entered[a], entered[b] = entered[b], entered[a] })
	jperm := rng.Perm(len(jockeys))

	w := going.Weight * surface.Rain
	for i, ri := range entered {
		p, j := roster[ri], jockeys[jperm[i]]
		fit := 0.975 + rng.Float64()*0.04 // how well it handles this surface today, up to 1.015
		if p.Trait == 1 && p.Pref == surface.Name {
			fit = p.spec
		}
		race.Horses = append(race.Horses, Horse{
			ID: i, Roster: ri, Name: p.Name, Color: j.Color, Coat: p.Coat, Jockey: j.Name, JockeyStars: j.Stars(),
			Mudder: p.Trait == 0, Specialist: p.Trait == 1, Pref: p.Pref, Stayer: p.Trait == 2,
			speed: p.speed * j.skill, stamina: p.stamina, accel: p.accel, kick: p.kick,
			ground: surface.Speed * fit * (1 + (p.mud-1)*w) * (1 - 0.06*w), // soft ground slows everyone
		})
	}

	// Odds from Monte Carlo probabilities, so they match the real simulation.
	margin := houseMargin
	if gp {
		margin = 0
	}
	const runs = 3000
	n := len(race.Horses)
	wins, places := make([]int, n), make([]int, n)
	hits := map[string]int{}
	for range runs {
		o := simulate(&race, rng, false).Order
		wins[o[0]]++
		places[o[0]]++
		places[o[1]]++
		hits[duplaKey(o[0], o[1])]++
		hits[exataKey(o[0], o[1])]++
		hits[trifetaKey(o[0], o[1], o[2])]++
	}
	for a := range n {
		race.Horses[a].Odds = odds(wins[a], runs, margin)
		race.Horses[a].Place = odds(places[a], runs, margin)
		for b := range n {
			if a == b {
				continue
			}
			if a < b {
				race.Dupla[duplaKey(a, b)] = odds(hits[duplaKey(a, b)], runs, margin)
			}
			race.Exata[exataKey(a, b)] = odds(hits[exataKey(a, b)], runs, margin)
			for c := range n {
				if c != a && c != b {
					race.Trifeta[trifetaKey(a, b, c)] = odds(hits[trifetaKey(a, b, c)], runs, margin)
				}
			}
		}
	}
	return race
}

func odds(hits, runs int, margin float64) float64 {
	p := math.Max(float64(hits), 1) / float64(runs)
	return math.Max(1.05, math.Round((1-margin)/p*100)/100)
}

// finishGap is the distance between 1st and 2nd at the moment the winner crosses the line.
func finishGap(res Result, dist float64) float64 {
	for _, f := range res.Frames {
		if f[res.Order[0]] >= dist {
			return dist - f[res.Order[1]]
		}
	}
	return 0
}

// simulate runs the race until every horse crosses the line. Frames are only kept when record is true.
// Velocity changes smoothly toward a target speed, so horses accelerate out of the gate, tire and kick.
func simulate(race *Race, rng *rand.Rand, record bool) Result {
	horses, dist := race.Horses, race.Distance
	n := len(horses)
	pos := make([]float64, n)
	vel := make([]float64, n)
	finished := make([]bool, n)
	form := make([]float64, n)   // day form: favourite is not a sure thing
	kickAt := make([]float64, n) // where each jockey asks for the final sprint
	delay := make([]int, n)      // gate reaction, in ticks
	for i := range horses {
		form[i] = 1 + rng.NormFloat64()*0.035
		kickAt[i] = dist * (0.65 + rng.Float64()*0.25)
		delay[i] = rng.IntN(3)
	}
	var res Result
	if record {
		res.Frames = append(res.Frames, make([]float64, n))
	}
	for tick := 0; len(res.Order) < n; tick++ {
		type cross struct {
			id   int
			over float64
		}
		var crossed []cross
		for i, h := range horses {
			if finished[i] || tick < delay[i] {
				continue
			}
			target := cruise * h.speed * h.ground * form[i]
			if tired := pos[i] - h.stamina; tired > 0 {
				target *= 1 - 0.08*tired/1000
			}
			if pos[i] > kickAt[i] {
				target *= h.kick
			}
			vel[i] += (target-vel[i])*h.accel + rng.NormFloat64()*0.25
			vel[i] = math.Max(vel[i], 0)
			pos[i] += vel[i]
			if pos[i] >= dist {
				finished[i] = true
				crossed = append(crossed, cross{h.ID, pos[i] - dist})
			}
		}
		// Horses crossing on the same tick: whoever went further past the line got there first.
		for len(crossed) > 0 {
			best := 0
			for j := range crossed {
				if crossed[j].over > crossed[best].over {
					best = j
				}
			}
			res.Order = append(res.Order, crossed[best].id)
			crossed = append(crossed[:best], crossed[best+1:]...)
		}
		if record {
			frame := make([]float64, n)
			for i := range pos {
				frame[i] = math.Min(pos[i], dist)
			}
			res.Frames = append(res.Frames, frame)
		}
	}
	return res
}
