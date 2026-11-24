package main

import (
	"fmt"
	"math/rand/v2"
	"path/filepath"
	"slices"
	"testing"
)

func TestRaceAndBet(t *testing.T) {
	g := newGame("")
	g.rng = rand.New(rand.NewPCG(1, 2))

	// With a 10% house margin, sum of 1/odds ≈ 1/(1-margin) ≈ 1.11 for win and 2×that for place (2 places paid).
	win, place := 0.0, 0.0
	for _, h := range g.race.Horses {
		win += 1 / h.Odds
		place += 1 / h.Place
		if h.Place > h.Odds {
			t.Fatalf("placê pagando mais que vencedor: %+v", h)
		}
	}
	if win < 1.05 || win > 1.2 || place < 2.0 || place > 2.4 {
		t.Fatalf("odds incoerentes: soma 1/odds vencedor=%.3f placê=%.3f", win, place)
	}

	for _, bad := range []betRequest{
		{RaceID: 1, HorseID: 0, Amount: startBalance + 1, Type: "win"},
		{RaceID: 1, HorseID: 99, Amount: 10, Type: "win"},
		{RaceID: 1, HorseID: 0, Amount: 10, Type: "quadrifeta"},
		{RaceID: 1, HorseID: 0, Horse2: 0, Horse3: 1, Amount: 10, Type: "trifeta"},
		{RaceID: 1, HorseID: 0, Amount: 0, Type: "win"},
	} {
		if _, err := g.placeBet(bad); err == "" {
			t.Fatalf("aceitou aposta inválida %+v", bad)
		}
	}

	odds, dist := g.race.Horses[2].Odds, g.race.Distance
	resp, err := g.placeBet(betRequest{RaceID: 1, HorseID: 2, Amount: 10, Type: "win"})
	if err != "" {
		t.Fatal(err)
	}
	if len(resp.Order) != 6 || resp.Order[0] != resp.WinnerID {
		t.Fatalf("ordem de chegada errada: %v", resp.Order)
	}
	// The winner must be the first to reach the line in the recorded frames.
	for _, f := range resp.Frames {
		for id, d := range f {
			if d >= dist && id != resp.WinnerID && f[resp.WinnerID] < dist {
				t.Fatalf("cavalo %d cruzou antes do vencedor %d", id, resp.WinnerID)
			}
		}
	}
	want := startBalance - 10 + resp.LevelReward + resp.MissionReward // a long-shot win can level up straight away
	if resp.Won {
		want += payout(10, odds)
	}
	if resp.Balance != want || g.Balance != want || g.Stats.Bets != 1 || len(g.Stats.History) != 1 {
		t.Fatalf("saldo %d, esperado %d, stats %+v", resp.Balance, want, g.Stats)
	}
	if _, err := g.placeBet(betRequest{RaceID: 1, HorseID: 0, Amount: 10, Type: "win"}); err == "" {
		t.Fatal("aceitou aposta em corrida já encerrada")
	}
}

func TestPlaceBetPaysTopTwo(t *testing.T) {
	g := newGame("")
	g.Balance = 1_000_000
	for i := range 60 {
		before, odds := g.Balance, g.race.Horses[0].Place
		resp, err := g.placeBet(betRequest{RaceID: g.RaceID, HorseID: 0, Amount: 100, Type: "place"})
		if err != "" {
			t.Fatal(err)
		}
		if resp.Won != slices.Contains(resp.Order[:2], 0) {
			t.Fatalf("corrida %d: placê won=%v com ordem %v", i, resp.Won, resp.Order)
		}
		if resp.Won && g.Balance != before-100+payout(100, odds)+resp.LevelReward+resp.MissionReward {
			t.Fatalf("pagamento errado do placê")
		}
	}
}

func TestSaveAndLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "save.json")
	g := newGame(path)
	if _, err := g.placeBet(betRequest{RaceID: 1, HorseID: 0, Amount: 10, Type: "win"}); err != "" {
		t.Fatal(err)
	}
	g.save()
	g2 := newGame(path)
	if g2.Balance != g.Balance || g2.RaceID != 2 || g2.Stats.Bets != 1 {
		t.Fatalf("save não restaurou: %+v", g2.saved)
	}
}

func TestStreakAndAchievements(t *testing.T) {
	g := newGame("")
	g.Balance = 1_000_000
	for range 60 {
		prev := g.Stats.Streak
		resp, err := g.placeBet(betRequest{RaceID: g.RaceID, HorseID: 0, Amount: 10, Type: "place"})
		if err != "" {
			t.Fatal(err)
		}
		if resp.Won && g.Stats.Streak != prev+1 || !resp.Won && g.Stats.Streak != 0 {
			t.Fatalf("sequência errada: antes %d, won=%v, agora %d", prev, resp.Won, g.Stats.Streak)
		}
		if resp.Won && !slices.Contains(g.Stats.Unlocked, "first_win") {
			t.Fatal("primeira vitória não desbloqueada")
		}
	}
	// Balance far above 2×start: "double" must be unlocked exactly once.
	if n := len(slices.DeleteFunc(slices.Clone(g.Stats.Unlocked), func(s string) bool { return s != "double" })); n != 1 {
		t.Fatalf("conquista 'double' aparece %d vezes", n)
	}
}

func TestDupla(t *testing.T) {
	g := newGame("")
	g.Balance = 1_000_000
	if _, err := g.placeBet(betRequest{RaceID: g.RaceID, HorseID: 1, Horse2: 1, Amount: 10, Type: "dupla"}); err == "" {
		t.Fatal("aceitou dupla com o mesmo cavalo")
	}
	if len(g.race.Dupla) != 15 {
		t.Fatalf("esperava 15 pares de dupla, veio %d", len(g.race.Dupla))
	}
	wins := 0
	for range 60 {
		odds := g.race.Dupla[duplaKey(1, 3)]
		before := g.Balance
		resp, err := g.placeBet(betRequest{RaceID: g.RaceID, HorseID: 3, Horse2: 1, Amount: 100, Type: "dupla"})
		if err != "" {
			t.Fatal(err)
		}
		top := []int{resp.Order[0], resp.Order[1]}
		want := slices.Contains(top, 1) && slices.Contains(top, 3)
		if resp.Won != want {
			t.Fatalf("dupla won=%v com ordem %v", resp.Won, resp.Order)
		}
		if want {
			wins++
			if g.Balance != before-100+payout(100, odds)+resp.LevelReward+resp.MissionReward {
				t.Fatal("pagamento errado da dupla")
			}
		}
	}
	t.Logf("dupla 1+3 acertou %d de 60", wins)
}

func TestRaceVariety(t *testing.T) {
	rng := rand.New(rand.NewPCG(3, 4))
	seen := map[string]bool{}
	for range 40 {
		r := newRace(rng, newRoster(7), 1)
		seen[r.Surface] = true
		seen[r.Going] = true
		seen[fmt.Sprint(r.Distance)] = true
		res := simulate(&r, rng, true)
		if last := res.Frames[len(res.Frames)-1]; slices.Max(last) != r.Distance {
			t.Fatalf("corrida de %vm terminou em %v", r.Distance, last)
		}
	}
	for _, k := range []string{"grama", "areia", "terra", "seca", "molhada", "pesada", "800", "1600"} {
		if !seen[k] {
			t.Fatalf("nunca sorteou %q em 40 corridas", k)
		}
	}
}

func TestPayoutInCentavos(t *testing.T) {
	// R$ 10,00 at 1.05 must pay R$ 10,50, not R$ 10 (old whole-reais truncation bug).
	for _, c := range []struct {
		amount int
		odds   float64
		want   int
	}{{10_00, 1.05, 10_50}, {5_00, 1.05, 5_25}, {3_33, 2.2, 7_33}, {1, 1.05, 1}} {
		if got := payout(c.amount, c.odds); got != c.want {
			t.Fatalf("payout(%d, %v) = %d, esperado %d", c.amount, c.odds, got, c.want)
		}
	}
}

func TestOneTraitPerHorseEvenlySpread(t *testing.T) {
	rng := rand.New(rand.NewPCG(5, 6))
	roster := newRoster(11)
	for id := 1; id <= 20; id++ {
		r := newRace(rng, roster, id)
		count := [3]int{}
		for _, h := range r.Horses {
			n := 0
			for k, on := range []bool{h.Mudder, h.Specialist, h.Stayer} {
				if on {
					n++
					count[k]++
				}
			}
			if n != 1 {
				t.Fatalf("%s tem %d características, esperado 1", h.Name, n)
			}
		}
		// 2/2/2 in a normal race, 3/3/2 (any order) in the 8-horse Grande Prêmio
		want := []int{2, 2, 2}
		if r.GP {
			want = []int{2, 3, 3}
		}
		if got := slices.Sorted(slices.Values(count[:])); !slices.Equal(got, want) {
			t.Fatalf("corrida %d: distribuição desigual (lama, superfície, fôlego) = %v", id, count)
		}
	}
}

func TestDailyBonusOncePerDay(t *testing.T) {
	g := newGame("")
	if msg := g.claimBonus("2026-11-24"); msg != "" || g.Balance != startBalance+dailyBonus {
		t.Fatalf("primeiro resgate falhou: %q, saldo %d", msg, g.Balance)
	}
	if msg := g.claimBonus("2026-11-24"); msg == "" || g.Balance != startBalance+dailyBonus {
		t.Fatalf("resgatou duas vezes no mesmo dia, saldo %d", g.Balance)
	}
	if msg := g.claimBonus("2026-11-25"); msg != "" || g.Balance != startBalance+2*dailyBonus {
		t.Fatalf("não liberou no dia seguinte: %q", msg)
	}
}

func TestLevels(t *testing.T) {
	for xp, want := range map[int]int{0: 1, 99: 1, 100: 2, 299: 2, 300: 3, 600: 4, 1000: 5} {
		if got := level(xp); got != want {
			t.Fatalf("level(%d) = %d, esperado %d", xp, got, want)
		}
	}
	// A losing bet gives 10 XP; at 95 XP it must cross into level 2 and pay R$ 20,00 on top of the result.
	g := newGame("")
	g.Stats.XP = 95
	g.Balance = 1_000_000
	resp, err := g.placeBet(betRequest{RaceID: g.RaceID, HorseID: 0, Amount: 100, Type: "win"})
	if err != "" {
		t.Fatal(err)
	}
	if resp.LevelUp != 2 || resp.LevelReward != levelReward*2 {
		t.Fatalf("subida de nível errada: %+v", resp.LevelUp)
	}
	if g.Balance != 1_000_000-100+resp.Payout+levelReward*2+resp.MissionReward {
		t.Fatalf("prêmio de nível não creditado: saldo %d", g.Balance)
	}
}

func TestExataAndTrifeta(t *testing.T) {
	g := newGame("")
	g.Balance = 10_000_000
	for i := range 40 {
		kind, picks := "exata", []int{0, 1}
		odds := g.race.Exata[exataKey(0, 1)]
		if i%2 == 1 {
			kind, picks = "trifeta", []int{2, 0, 1}
			odds = g.race.Trifeta[trifetaKey(2, 0, 1)]
		}
		before := g.Balance
		resp, err := g.placeBet(betRequest{RaceID: g.RaceID, HorseID: picks[0], Horse2: picks[1], Horse3: 1, Amount: 100, Type: kind})
		if err != "" {
			t.Fatal(err)
		}
		if want := slices.Equal(resp.Order[:len(picks)], picks); resp.Won != want {
			t.Fatalf("%s %v won=%v com ordem %v", kind, picks, resp.Won, resp.Order)
		}
		want := before - 100 + resp.LevelReward + resp.MissionReward
		if resp.Won {
			want += payout(100, odds)
		}
		if g.Balance != want {
			t.Fatalf("%s: saldo %d, esperado %d", kind, g.Balance, want)
		}
	}
	n := len(g.race.Horses)
	if len(g.race.Exata) != n*(n-1) || len(g.race.Trifeta) != n*(n-1)*(n-2) {
		t.Fatalf("combinações erradas: exata %d, trifeta %d", len(g.race.Exata), len(g.race.Trifeta))
	}
}

func TestRosterAndFormSurviveRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "save.json")
	g := newGame(path)
	traits := [3]int{}
	names := map[string]bool{}
	for _, p := range g.roster {
		traits[p.Trait]++
		names[p.Name] = true
	}
	if traits != [3]int{10, 10, 10} || len(names) != rosterSize {
		t.Fatalf("elenco errado: características %v, %d nomes únicos", traits, len(names))
	}
	entered := g.race.Horses
	resp, err := g.placeBet(betRequest{RaceID: 1, HorseID: 0, Amount: 10, Type: "win"})
	if err != "" {
		t.Fatal(err)
	}
	for pos, id := range resp.Order {
		if f := g.Form[entered[id].Roster]; len(f) == 0 || f[0] != pos+1 {
			t.Fatalf("%s chegou em %dº mas a ficha diz %v", entered[id].Name, pos+1, f)
		}
	}
	g.save()
	g2 := newGame(path)
	if g2.RosterSeed != g.RosterSeed || g2.roster[7].Name != g.roster[7].Name || len(g2.Form) != len(g.Form) {
		t.Fatal("elenco ou ficha não sobreviveram ao reinício")
	}
}

func TestGrandPrix(t *testing.T) {
	rng := rand.New(rand.NewPCG(8, 9))
	r := newRace(rng, newRoster(3), gpEvery)
	if !r.GP || len(r.Horses) != 8 || r.Distance != gpDistance || len(r.Trifeta) != 8*7*6 {
		t.Fatalf("GP errado: gp=%v cavalos=%d distância=%v", r.GP, len(r.Horses), r.Distance)
	}
	silks := map[string]bool{}
	inv := 0.0
	for _, h := range r.Horses {
		silks[h.Color] = true
		inv += 1 / h.Odds
	}
	if len(silks) != 8 {
		t.Fatal("dois cavalos com o mesmo jóquei")
	}
	// no house margin: sum of 1/odds ≈ 1 (a bit less because of rounding and the 1.05 floor)
	if inv < 0.93 || inv > 1.03 {
		t.Fatalf("GP deveria ter odds justas, soma 1/odds = %.3f", inv)
	}
	if newRace(rng, newRoster(3), gpEvery+1).GP {
		t.Fatal("páreo seguinte não deveria ser GP")
	}
}

func TestMissions(t *testing.T) {
	g := newGame("")
	if !g.ensureMissions("2026-11-24") || g.ensureMissions("2026-11-24") {
		t.Fatal("missões deveriam ser sorteadas só uma vez por dia")
	}
	if len(g.Missions.List) != missionsPerDay {
		t.Fatalf("esperava %d missões, veio %d", missionsPerDay, len(g.Missions.List))
	}
	g.Missions.List = []Mission{{ID: "bets3", Text: "Faça 3 apostas", Goal: 3}, {ID: "night", Text: "Noturna", Goal: 1}}
	day := &Race{}
	for i := range 3 {
		done := g.progressMissions(betOutcome{kind: "win", race: day})
		if (i == 2) != (len(done) == 1) {
			t.Fatalf("aposta %d: missões concluídas %v", i+1, done)
		}
	}
	if done := g.progressMissions(betOutcome{kind: "win", race: &Race{Night: true}}); len(done) != 1 || done[0] != "Noturna" {
		t.Fatalf("missão noturna não concluiu: %v", done)
	}
	if done := g.progressMissions(betOutcome{kind: "win", race: &Race{Night: true}}); len(done) != 0 {
		t.Fatal("missão concluída contou de novo")
	}
}
