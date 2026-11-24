package main

import "slices"

const (
	missionsPerDay = 3
	missionReward  = 15_00 // R$ 15,00 per completed mission
	missionXP      = 40
)

type Mission struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Goal     int    `json:"goal"`
	Progress int    `json:"progress"`
	Done     bool   `json:"done"`
}

// Missions are the daily challenges; a new set is drawn when the calendar day changes.
type Missions struct {
	Day  string    `json:"day"`
	List []Mission `json:"list"`
}

// betOutcome is what a mission looks at after each settled bet.
type betOutcome struct {
	kind string // bet type
	won  bool
	odds float64
	race *Race
}

var missionPool = []struct {
	id, text string
	goal     int
	counts   func(o betOutcome) bool
}{
	{"bets3", "Faça 3 apostas", 3, func(o betOutcome) bool { return true }},
	{"wins3", "Ganhe 3 apostas", 3, func(o betOutcome) bool { return o.won }},
	{"place2", "Ganhe 2 apostas de placê", 2, func(o betOutcome) bool { return o.won && o.kind == "place" }},
	{"odd5", "Ganhe uma aposta com odd 5 ou mais", 1, func(o betOutcome) bool { return o.won && o.odds >= 5 }},
	{"night", "Aposte numa corrida noturna", 1, func(o betOutcome) bool { return o.race.Night }},
	{"terra", "Ganhe uma corrida na terra", 1, func(o betOutcome) bool { return o.won && o.race.Surface == "terra" }},
	{"combo", "Acerte uma dupla, exata ou trifeta", 1, func(o betOutcome) bool {
		return o.won && slices.Contains([]string{"dupla", "exata", "trifeta"}, o.kind)
	}},
	{"long", "Aposte numa corrida de 1600 m ou mais", 1, func(o betOutcome) bool { return o.race.Distance >= 1600 }},
	{"rain", "Aposte numa pista molhada ou pesada", 1, func(o betOutcome) bool { return o.race.Going != "seca" }},
}

// ensureMissions draws a fresh set of missions when the day changes. Returns true if it did. Caller holds g.mu.
func (g *game) ensureMissions(day string) bool {
	if g.Missions.Day == day {
		return false
	}
	g.Missions = Missions{Day: day}
	for _, i := range g.rng.Perm(len(missionPool))[:missionsPerDay] {
		m := missionPool[i]
		g.Missions.List = append(g.Missions.List, Mission{ID: m.id, Text: m.text, Goal: m.goal})
	}
	return true
}

// progressMissions advances today's missions with a settled bet and returns the ones it completed.
func (g *game) progressMissions(o betOutcome) (completed []string) {
	for i := range g.Missions.List {
		m := &g.Missions.List[i]
		if m.Done {
			continue
		}
		for _, def := range missionPool {
			if def.id == m.ID && def.counts(o) {
				m.Progress++
			}
		}
		if m.Progress >= m.Goal {
			m.Done = true
			completed = append(completed, m.Text)
		}
	}
	return completed
}
