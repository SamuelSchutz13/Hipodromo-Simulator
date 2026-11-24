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
)

type Horse struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	Color      string  `json:"color"`      // jockey silk
	Coat       string  `json:"coat"`       // horse body colour
	Odds       float64 `json:"odds"`       // win
	Place      float64 `json:"placeOdds"`  // finishes 1st or 2nd
	Mudder     bool    `json:"mudder"`     // public hint: likes soft ground
	Specialist bool    `json:"specialist"` // public hint: good on today's surface
	Stayer     bool    `json:"stayer"`     // public hint: lots of stamina
	// Hidden from players; they only see the odds and hints.
	speed   float64 // top speed multiplier
	stamina float64 // metres run before tiring
	accel   float64 // how fast it reaches the target speed
	kick    float64 // final sprint multiplier
	ground  float64 // speed multiplier from today's surface, ground and how this horse handles them
}

type Race struct {
	Horses   []Horse            `json:"horses"`
	Surface  string             `json:"surface"`
	Going    string             `json:"going"`
	Distance float64            `json:"distance"`
	Dupla    map[string]float64 `json:"duplaOdds"` // "i-j" (i<j): both finish 1st and 2nd, any order
	Night    bool               `json:"night"`     // floodlit evening race; visual only
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
	colors = []string{"#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#9333ea", "#0891b2"}
	coats  = []string{"#6b3e1f", "#3b2414", "#1c1917", "#8a5a33", "#a8a29e", "#d6c3a5", "#4a2c17"}
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

func duplaKey(a, b int) string { return fmt.Sprintf("%d-%d", min(a, b), max(a, b)) }

// newRace draws six horses, the surface, ground and distance, then prices every bet.
func newRace(rng *rand.Rand) Race {
	going := goings[rng.IntN(len(goings))]
	surface := surfaces[rng.IntN(len(surfaces))]
	race := Race{
		Horses:   make([]Horse, len(colors)),
		Surface:  surface.Name,
		Going:    going.Name,
		Distance: distances[rng.IntN(len(distances))],
		Dupla:    map[string]float64{},
		Night:    rng.IntN(4) == 0,
	}
	w := going.Weight * surface.Rain
	used := map[string]bool{}
	// Exactly one strength per horse, spread evenly: 2 mud lovers, 2 surface specialists, 2 stayers.
	traits := rng.Perm(len(race.Horses))
	for i := range race.Horses {
		name := ""
		for name == "" || used[name] {
			name = firstNames[rng.IntN(len(firstNames))] + " " + lastNames[rng.IntN(len(lastNames))]
		}
		used[name] = true
		trait := traits[i] % 3
		h := Horse{
			ID: i, Name: name, Color: colors[i], Coat: coats[rng.IntN(len(coats))],
			speed:  0.975 + rng.Float64()*0.05,
			accel:  0.08 + rng.Float64()*0.08,
			kick:   1.0 + rng.Float64()*0.07,
			Mudder: trait == 0, Specialist: trait == 1, Stayer: trait == 2,
		}
		// Each hidden value is drawn from the "strong" range only for the horse's own trait.
		mud := 0.96 + rng.Float64()*0.06 // up to 1.02
		if h.Mudder {
			mud = 1.02 + rng.Float64()*0.02
		}
		fit := 0.975 + rng.Float64()*0.04 // how well it handles today's surface, up to 1.015
		if h.Specialist {
			fit = 1.015 + rng.Float64()*0.01
		}
		h.stamina = 800 + rng.Float64()*500 // metres before tiring, up to 1300
		if h.Stayer {
			h.stamina = 1300 + rng.Float64()*200
		}
		h.ground = surface.Speed * fit * (1 + (mud-1)*w) * (1 - 0.06*w) // soft ground slows everyone
		race.Horses[i] = h
	}
	// Odds from Monte Carlo probabilities, so they match the real simulation.
	const runs = 3000
	wins := make([]int, len(race.Horses))
	places := make([]int, len(race.Horses))
	pairs := map[string]int{}
	for range runs {
		order := simulate(&race, rng, false).Order
		wins[order[0]]++
		places[order[0]]++
		places[order[1]]++
		pairs[duplaKey(order[0], order[1])]++
	}
	for i := range race.Horses {
		race.Horses[i].Odds = odds(wins[i], runs)
		race.Horses[i].Place = odds(places[i], runs)
		for j := i + 1; j < len(race.Horses); j++ {
			race.Dupla[duplaKey(i, j)] = odds(pairs[duplaKey(i, j)], runs)
		}
	}
	return race
}

func odds(hits, runs int) float64 {
	p := math.Max(float64(hits), 1) / float64(runs)
	return math.Max(1.05, math.Round((1-houseMargin)/p*100)/100)
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
