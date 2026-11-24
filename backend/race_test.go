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
		{RaceID: 1, HorseID: 0, Amount: 10, Type: "trifeta"},
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
	want := startBalance - 10 + resp.LevelReward // a long-shot win can level up straight away
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
		if resp.Won && g.Balance != before-100+payout(100, odds)+resp.LevelReward {
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
			if g.Balance != before-100+payout(100, odds)+resp.LevelReward {
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
		r := newRace(rng)
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
	for range 20 {
		r := newRace(rng)
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
		if count != [3]int{2, 2, 2} {
			t.Fatalf("distribuição desigual (lama, superfície, fôlego) = %v", count)
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
	if g.Balance != 1_000_000-100+resp.Payout+levelReward*2 {
		t.Fatalf("prêmio de nível não creditado: saldo %d", g.Balance)
	}
}
