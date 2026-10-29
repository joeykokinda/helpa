package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

// The watcher is Helpa's background agent: every few minutes it walks every open job, has Muse check on parts in
// the mail, and taps the person on the shoulder (Web Push) when a part arrives, a reminder is due or a pro is coming
// tomorrow. In replay mode it plays a delivery through in about two minutes, so the whole loop can be demoed offline.

var trackingSchema = map[string]any{
	"type": "object", "additionalProperties": false, "required": []string{"status", "eta", "note"},
	"properties": map[string]any{
		"status": map[string]any{"type": "string", "enum": []string{"unknown", "ordered", "shipped", "out_for_delivery", "delivered", "problem"}},
		"eta":    stringField("Expected delivery date as shown, e.g. 'Thu, Nov 5'; empty if not shown."),
		"note":   stringField("One short line for the person, e.g. 'Left Memphis, TN this morning.'"),
	},
}

const trackingInstructions = `You check where a package is. Use web search on the carrier's tracking for this tracking number
(or the store's order page). Report only what the tracking actually shows; if you can't find it, status is "unknown".
Then call submit_tracking.`

func checkTracking(ctx context.Context, part jobPart) (status, eta, note string, err error) {
	brief := fmt.Sprintf("Carrier: %s\nTracking number: %s\nStore: %s\nOrder page: %s\nItem: %s", part.Carrier, part.Tracking, part.Store, part.OrderURL, part.Name)
	raw, _, err := webAgent(ctx, "muse-spark-1.3", trackingInstructions, brief, "submit_tracking", trackingSchema)
	if err != nil {
		return "", "", "", err
	}
	var found struct{ Status, ETA, Note string }
	if err := json.Unmarshal(raw, &found); err != nil {
		return "", "", "", err
	}
	return found.Status, found.ETA, found.Note, nil
}

var trackingOrder = map[string]int{"found": 0, "ordered": 1, "shipped": 2, "out_for_delivery": 3, "delivered": 4}

// replayTracking walks an order forward on a clock: shipped after 30 s, out for delivery after 60 s, delivered after 90 s.
func replayTracking(part jobPart, now time.Time) (string, string, string) {
	elapsed := now.Sub(time.UnixMilli(part.OrderedAt))
	switch {
	case elapsed > 90*time.Second:
		return "delivered", "Today", "Delivered to your front door."
	case elapsed > 60*time.Second:
		return "out_for_delivery", "Today", "Out for delivery."
	case elapsed > 30*time.Second:
		return "shipped", "Tomorrow", "Shipped. On its way to you."
	}
	return "ordered", "", ""
}

// demoTracking is the tracking number to type when just trying Helpa: the order plays through like in replay mode.
func demoTracking(tracking string) bool {
	return strings.EqualFold(strings.TrimSpace(tracking), "demo")
}

type notice struct{ title, body, path string }

// watchOnce makes one pass over every device; it returns how many notifications it sent.
func watchOnce(ctx context.Context, now time.Time) int {
	sent := 0
	for _, device := range jobs.devices() {
		var notices []notice
		var push json.RawMessage
		var toCheck []struct{ jobID, partID string }
		jobs.update(device, func(file *deviceFile) error {
			push = file.Push
			for jobIndex := range file.Jobs {
				item := &file.Jobs[jobIndex]
				if !item.open() {
					continue
				}
				for partIndex := range item.Parts {
					part := &item.Parts[partIndex]
					if part.Status == "found" || part.Status == "delivered" {
						continue
					}
					if replayDir != "" || demoTracking(part.Tracking) {
						if status, eta, note := replayTracking(*part, now); trackingOrder[status] > trackingOrder[part.Status] {
							notices = append(notices, advancePart(item, part, status, eta, note)...)
						}
						continue
					}
					wait := 4 * time.Hour
					if part.Status == "out_for_delivery" {
						wait = time.Hour
					}
					if part.Tracking != "" && now.Sub(time.UnixMilli(part.LastChecked)) > wait {
						toCheck = append(toCheck, struct{ jobID, partID string }{item.ID, part.ID})
					}
					// No tracking number: a gentle nudge five days after ordering.
					if part.Tracking == "" && !part.Notified && now.Sub(time.UnixMilli(part.OrderedAt)) > 5*24*time.Hour {
						part.Notified = true
						notices = append(notices, notice{"Did your part arrive?", fmt.Sprintf("The %s should be there by now. Tap when it's in.", part.Name), "/app?job=" + item.ID})
					}
				}
				for index := range item.FollowUps {
					followUp := &item.FollowUps[index]
					if !followUp.Done && !followUp.Notified && now.UnixMilli() >= followUp.Due {
						followUp.Notified = true
						item.note("reminder", "Reminder: "+followUp.Label)
						notices = append(notices, notice{"Time for a quick check", fmt.Sprintf("%s (%s)", followUp.Label, item.Appliance), "/app?job=" + item.ID})
					}
				}
				if appointment := item.Appointment; appointment != nil && !appointment.Notified {
					until := time.UnixMilli(appointment.At).Sub(now)
					if until > 0 && until < 24*time.Hour {
						appointment.Notified = true
						notices = append(notices, notice{"Pro visit tomorrow", fmt.Sprintf("%s comes %s. Your job summary is ready to show them.", appointment.Pro, time.UnixMilli(appointment.At).Format("Mon 3:04 PM")), "/app?job=" + item.ID})
					}
				}
			}
			return nil
		})
		// Tracking checks call the model, so they run outside the file lock.
		for _, target := range toCheck {
			if spend.past(0.8) {
				break
			}
			var part jobPart
			jobs.mutex.Lock()
			for _, item := range jobs.read(device).Jobs {
				if item.ID == target.jobID {
					if found := item.part(target.partID); found != nil {
						part = *found
					}
				}
			}
			jobs.mutex.Unlock()
			status, eta, note, err := checkTracking(ctx, part)
			jobs.updateJob(device, target.jobID, func(item *job) error {
				current := item.part(target.partID)
				if current == nil {
					return nil
				}
				current.LastChecked = now.UnixMilli()
				if err != nil {
					log.Printf("watch %s: %v", current.Tracking, err)
					return nil
				}
				if status == "problem" {
					current.LastNote = note
					item.note("note", "Delivery problem: "+note)
					notices = append(notices, notice{"Problem with your part's delivery", note, "/app?job=" + item.ID})
				} else if trackingOrder[status] > trackingOrder[current.Status] {
					notices = append(notices, advancePart(item, current, status, eta, note)...)
				} else if note != "" {
					current.LastNote, current.ETA = note, firstNonEmpty(eta, current.ETA)
				}
				return nil
			})
		}
		for _, message := range notices {
			if push == nil {
				break
			}
			if err := sendPush(push, message.title, message.body, message.path); err != nil {
				log.Printf("push to %s: %v", device[:6], err)
				if err == errGone {
					jobs.update(device, func(file *deviceFile) error { file.Push = nil; return nil })
					break
				}
				continue
			}
			sent++
		}
	}
	return sent
}

// advancePart records a delivery step on the job and says what to tell the person.
func advancePart(item *job, part *jobPart, status, eta, note string) []notice {
	part.Status, part.ETA, part.LastNote = status, firstNonEmpty(eta, part.ETA), note
	switch status {
	case "shipped":
		item.note("part_shipped", fmt.Sprintf("The %s shipped. %s", part.Name, note))
		return []notice{{"Your part shipped", fmt.Sprintf("The %s is on its way%s.", part.Name, etaSuffix(part.ETA)), "/app?job=" + item.ID}}
	case "out_for_delivery":
		item.note("part_shipped", fmt.Sprintf("The %s is out for delivery.", part.Name))
		return []notice{{"Arriving today", fmt.Sprintf("Your %s is out for delivery.", part.Name), "/app?job=" + item.ID}}
	case "delivered":
		item.Status = "part_arrived"
		item.note("part_arrived", fmt.Sprintf("The %s arrived. Ready to install.", part.Name))
		return []notice{{"Your part arrived!", fmt.Sprintf("The %s is here. Tap and Helpa walks you through putting it in.", part.Name), "/app?job=" + item.ID + "&install=" + part.ID}}
	}
	return nil
}

func etaSuffix(eta string) string {
	if eta == "" {
		return ""
	}
	return ", arriving " + strings.TrimSpace(eta)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// startWatcher runs the watcher for the life of the server.
func startWatcher() {
	// Each pass is cheap (tracking checks wait hours between calls), so it runs often enough for a demo order to move.
	every := 15 * time.Second
	go func() {
		for {
			time.Sleep(every)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			if sent := watchOnce(ctx, time.Now()); sent > 0 {
				log.Printf("watcher: sent %d notifications", sent)
			}
			cancel()
		}
	}()
}
