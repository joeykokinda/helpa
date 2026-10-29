package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"
)

// A job is one thing being fixed, from diagnosis to working again: the part on order, the pro booked, the check
// in two months. Jobs live on the server, under an anonymous device id the phone makes up, so Helpa's agents can
// keep working on them (watching an order, reminding you) while the app is closed. There is no login.

type jobLog struct {
	At   int64  `json:"at"`
	Kind string `json:"kind"` // diagnosed, part_found, part_ordered, part_shipped, part_arrived, pros_found, contacted, booked, fixed, note, reminder
	Text string `json:"text"`
}

type buyOption struct {
	Store   string `json:"store"`
	URL     string `json:"url"`
	Price   string `json:"price"`
	InStock bool   `json:"in_stock"`
}

type jobPart struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	PartNumber string      `json:"part_number"`
	Fits       string      `json:"fits"`
	Confidence string      `json:"confidence"`
	Buy        []buyOption `json:"buy"`
	// found, ordered, shipped, out_for_delivery, delivered
	Status      string `json:"status"`
	Store       string `json:"store,omitempty"`
	OrderURL    string `json:"order_url,omitempty"`
	Carrier     string `json:"carrier,omitempty"`
	Tracking    string `json:"tracking,omitempty"`
	ETA         string `json:"eta,omitempty"`
	LastNote    string `json:"last_note,omitempty"`
	OrderedAt   int64  `json:"ordered_at,omitempty"`
	LastChecked int64  `json:"last_checked,omitempty"`
	Notified    bool   `json:"notified,omitempty"`
}

type jobPro struct {
	Name      string  `json:"name"`
	Trade     string  `json:"trade"`
	Rating    float64 `json:"rating"`
	Reviews   int     `json:"reviews"`
	Phone     string  `json:"phone"`
	Website   string  `json:"website"`
	Address   string  `json:"address"`
	Why       string  `json:"why"`
	Hours     string  `json:"hours"`
	Contacted int64   `json:"contacted,omitempty"`
}

type jobFollowUp struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Due      int64  `json:"due"`
	Done     bool   `json:"done"`
	Notified bool   `json:"notified,omitempty"`
}

type jobAppointment struct {
	Pro      string `json:"pro"`
	Phone    string `json:"phone,omitempty"`
	At       int64  `json:"at"`
	Notified bool   `json:"notified,omitempty"`
}

type job struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Appliance string `json:"appliance"`
	Brand     string `json:"brand"`
	Model     string `json:"model"`
	// fixing, needs_part, waiting_part, part_arrived, needs_pro, pro_booked, done
	Status      string          `json:"status"`
	Diagnosis   string          `json:"diagnosis"`
	RuledOut    []string        `json:"ruled_out"`
	Tried       []string        `json:"tried"`
	PartsNeeded []string        `json:"parts_needed"`
	Parts       []jobPart       `json:"parts"`
	Pros        []jobPro        `json:"pros"`
	Location    string          `json:"location,omitempty"`
	Appointment *jobAppointment `json:"appointment,omitempty"`
	FollowUps   []jobFollowUp   `json:"follow_ups"`
	Log         []jobLog        `json:"log"`
	CreatedAt   int64           `json:"created_at"`
	UpdatedAt   int64           `json:"updated_at"`
}

func (item *job) note(kind, text string) {
	now := time.Now().UnixMilli()
	item.Log = append(item.Log, jobLog{At: now, Kind: kind, Text: text})
	item.UpdatedAt = now
}

func (item *job) part(id string) *jobPart {
	for index := range item.Parts {
		if item.Parts[index].ID == id {
			return &item.Parts[index]
		}
	}
	return nil
}

func (item *job) open() bool { return item.Status != "done" }

// Summary is what a technician needs before they come, so you aren't charged to diagnose it twice.
func (item *job) summary() string {
	var lines []string
	machine := strings.TrimSpace(strings.Join([]string{item.Brand, item.Model, item.Appliance}, " "))
	lines = append(lines, fmt.Sprintf("Machine: %s", machine))
	lines = append(lines, fmt.Sprintf("Problem: %s", item.Title))
	if item.Diagnosis != "" {
		lines = append(lines, "Likely cause: "+item.Diagnosis)
	}
	if len(item.RuledOut) > 0 {
		lines = append(lines, "Already ruled out: "+strings.Join(item.RuledOut, "; "))
	}
	if len(item.Tried) > 0 {
		lines = append(lines, "Already tried: "+strings.Join(item.Tried, "; "))
	}
	for _, part := range item.Parts {
		if part.PartNumber != "" {
			lines = append(lines, fmt.Sprintf("Part: %s (%s), %s", part.Name, part.PartNumber, strings.ReplaceAll(part.Status, "_", " ")))
		}
	}
	return strings.Join(lines, "\n")
}

/* ---------- storage: one JSON file per device ---------- */

var dataDir = envOr("HELPA_DATA", "data")

type jobStore struct {
	mutex sync.Mutex
}

var jobs = &jobStore{}

var deviceIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

type deviceFile struct {
	Jobs []job `json:"jobs"`
	// Push is the browser's Web Push subscription, when the person turned notifications on.
	Push json.RawMessage `json:"push,omitempty"`
}

func devicePath(device string) string { return filepath.Join(dataDir, "jobs", device+".json") }

func (store *jobStore) read(device string) deviceFile {
	var file deviceFile
	data, err := os.ReadFile(devicePath(device))
	if err == nil {
		json.Unmarshal(data, &file)
	}
	return file
}

func (store *jobStore) write(device string, file deviceFile) error {
	if err := os.MkdirAll(filepath.Join(dataDir, "jobs"), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(file, "", " ")
	if err != nil {
		return err
	}
	temporary := devicePath(device) + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, devicePath(device))
}

// update runs change on a device's file under the lock and saves it.
func (store *jobStore) update(device string, change func(file *deviceFile) error) error {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	file := store.read(device)
	if err := change(&file); err != nil {
		return err
	}
	return store.write(device, file)
}

// updateJob runs change on one job; errNoJob when it isn't there.
func (store *jobStore) updateJob(device, id string, change func(item *job) error) (*job, error) {
	var out *job
	err := store.update(device, func(file *deviceFile) error {
		for index := range file.Jobs {
			if file.Jobs[index].ID == id {
				if err := change(&file.Jobs[index]); err != nil {
					return err
				}
				copied := file.Jobs[index]
				out = &copied
				return nil
			}
		}
		return errNoJob
	})
	return out, err
}

func (store *jobStore) devices() []string {
	paths, _ := filepath.Glob(filepath.Join(dataDir, "jobs", "*.json"))
	var devices []string
	for _, path := range paths {
		devices = append(devices, strings.TrimSuffix(filepath.Base(path), ".json"))
	}
	return devices
}

var errNoJob = fmt.Errorf("no such job")

func newID() string {
	random := make([]byte, 8)
	rand.Read(random)
	return hex.EncodeToString(random)
}

/* ---------- HTTP ---------- */

func deviceOf(writer http.ResponseWriter, request *http.Request) (string, bool) {
	device := strings.ToLower(strings.TrimSpace(request.Header.Get("X-Helpa-Device")))
	if !deviceIDPattern.MatchString(device) {
		http.Error(writer, "missing device id", http.StatusBadRequest)
		return "", false
	}
	return device, true
}

func writeJSON(writer http.ResponseWriter, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(writer).Encode(value)
}

func readBody(writer http.ResponseWriter, request *http.Request, into any) bool {
	request.Body = http.MaxBytesReader(writer, request.Body, 64<<10)
	if err := json.NewDecoder(request.Body).Decode(into); err != nil {
		http.Error(writer, "bad request: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

func replyJob(writer http.ResponseWriter, item *job, err error) {
	if err == errNoJob {
		http.Error(writer, "no such job", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("jobs: %v", err)
		http.Error(writer, "couldn't save that", http.StatusInternalServerError)
		return
	}
	writeJSON(writer, item)
}

func registerJobRoutes() {
	http.HandleFunc("GET /api/jobs", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		jobs.mutex.Lock()
		file := jobs.read(device)
		jobs.mutex.Unlock()
		list := file.Jobs
		if list == nil {
			list = []job{}
		}
		slices.SortFunc(list, func(first, second job) int { return int(second.UpdatedAt - first.UpdatedAt) })
		writeJSON(writer, list)
	})

	// A job starts from a plan: what's wrong, what was tried, what parts it may need.
	http.HandleFunc("POST /api/jobs", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		var body struct {
			Title, Appliance, Brand, Model, Diagnosis, Status string
			RuledOut, Tried, PartsNeeded                      []string
		}
		if !readBody(writer, request, &body) {
			return
		}
		now := time.Now().UnixMilli()
		item := job{ID: newID(), Title: clip(body.Title, 120), Appliance: clip(body.Appliance, 60), Brand: clip(body.Brand, 60), Model: clip(body.Model, 60),
			Diagnosis: clip(body.Diagnosis, 600), Status: body.Status, RuledOut: clipAll(body.RuledOut, 8, 160), Tried: clipAll(body.Tried, 20, 160),
			PartsNeeded: clipAll(body.PartsNeeded, 6, 120), Parts: []jobPart{}, Pros: []jobPro{}, FollowUps: []jobFollowUp{}, CreatedAt: now, UpdatedAt: now}
		if !slices.Contains(jobStatuses, item.Status) {
			item.Status = "fixing"
		}
		item.note("diagnosed", "Helpa diagnosed it: "+firstSentence(item.Diagnosis))
		err := jobs.update(device, func(file *deviceFile) error {
			if len(file.Jobs) >= 200 {
				return fmt.Errorf("too many jobs")
			}
			file.Jobs = append(file.Jobs, item)
			return nil
		})
		replyJob(writer, &item, err)
	})

	// Status changes and notes from the app: fixed it, still broken, a pro is coming, a note.
	http.HandleFunc("POST /api/jobs/{id}/status", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		var body struct{ Status, Note string }
		if !readBody(writer, request, &body) {
			return
		}
		item, err := jobs.updateJob(device, request.PathValue("id"), func(item *job) error {
			if body.Status != "" && slices.Contains(jobStatuses, body.Status) {
				item.Status = body.Status
			}
			kind := "note"
			if body.Status == "done" {
				kind = "fixed"
			}
			if note := clip(body.Note, 300); note != "" {
				item.note(kind, note)
			} else {
				item.UpdatedAt = time.Now().UnixMilli()
			}
			return nil
		})
		replyJob(writer, item, err)
	})

	// "Check it again in 2 months": a reminder the scheduler pushes when it's due.
	http.HandleFunc("POST /api/jobs/{id}/follow-ups", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		var body struct {
			Label string
			Due   int64
			Done  string // a follow-up id to mark done instead
		}
		if !readBody(writer, request, &body) {
			return
		}
		item, err := jobs.updateJob(device, request.PathValue("id"), func(item *job) error {
			if body.Done != "" {
				for index := range item.FollowUps {
					if item.FollowUps[index].ID == body.Done {
						item.FollowUps[index].Done = true
						item.note("note", "Done: "+item.FollowUps[index].Label)
					}
				}
				return nil
			}
			if body.Label == "" || body.Due <= 0 {
				return fmt.Errorf("a follow-up needs a label and a date")
			}
			item.FollowUps = append(item.FollowUps, jobFollowUp{ID: newID(), Label: clip(body.Label, 120), Due: body.Due})
			item.note("reminder", fmt.Sprintf("Reminder set: %s on %s", clip(body.Label, 120), time.UnixMilli(body.Due).Format("Jan 2")))
			return nil
		})
		replyJob(writer, item, err)
	})

	// "I ordered it": the order watcher takes it from here.
	http.HandleFunc("POST /api/jobs/{id}/parts/{part}/ordered", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		var body struct{ Store, OrderURL, Carrier, Tracking, ETA string }
		if !readBody(writer, request, &body) {
			return
		}
		item, err := jobs.updateJob(device, request.PathValue("id"), func(item *job) error {
			part := item.part(request.PathValue("part"))
			if part == nil {
				return errNoJob
			}
			part.Status, part.Store, part.OrderURL = "ordered", clip(body.Store, 60), clip(body.OrderURL, 400)
			part.Carrier, part.Tracking, part.ETA = clip(body.Carrier, 30), clip(strings.ReplaceAll(body.Tracking, " ", ""), 40), clip(body.ETA, 40)
			part.OrderedAt = time.Now().UnixMilli()
			item.Status = "waiting_part"
			where := part.Store
			if where == "" {
				where = "the store"
			}
			item.note("part_ordered", fmt.Sprintf("Ordered the %s from %s. Helpa is watching the delivery.", part.Name, where))
			return nil
		})
		replyJob(writer, item, err)
	})

	// The appointment a pro confirmed; the scheduler reminds you the day before.
	http.HandleFunc("POST /api/jobs/{id}/appointment", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		var body struct {
			Pro, Phone string
			At         int64
			Contacted  string // a pro's name, to log that you reached out
		}
		if !readBody(writer, request, &body) {
			return
		}
		item, err := jobs.updateJob(device, request.PathValue("id"), func(item *job) error {
			if body.Contacted != "" {
				for index := range item.Pros {
					if item.Pros[index].Name == body.Contacted {
						item.Pros[index].Contacted = time.Now().UnixMilli()
					}
				}
				item.note("contacted", "Reached out to "+clip(body.Contacted, 80)+" with the job summary.")
				return nil
			}
			if body.At <= 0 || body.Pro == "" {
				return fmt.Errorf("an appointment needs a pro and a time")
			}
			item.Appointment = &jobAppointment{Pro: clip(body.Pro, 80), Phone: clip(body.Phone, 30), At: body.At}
			item.Status = "pro_booked"
			item.note("booked", fmt.Sprintf("%s is booked for %s.", item.Appointment.Pro, time.UnixMilli(body.At).Format("Mon Jan 2, 3:04 PM")))
			return nil
		})
		replyJob(writer, item, err)
	})

	http.HandleFunc("POST /api/jobs/{id}/delete", func(writer http.ResponseWriter, request *http.Request) {
		device, ok := deviceOf(writer, request)
		if !ok {
			return
		}
		err := jobs.update(device, func(file *deviceFile) error {
			file.Jobs = slices.DeleteFunc(file.Jobs, func(item job) bool { return item.ID == request.PathValue("id") })
			return nil
		})
		replyJob(writer, &job{}, err)
	})

	http.HandleFunc("POST /api/jobs/{id}/parts/find", handleFindParts)
	http.HandleFunc("POST /api/jobs/{id}/pros/find", handleFindPros)
	http.HandleFunc("GET /api/push/key", handlePushKey)
	http.HandleFunc("POST /api/push/subscribe", handlePushSubscribe)
}

var jobStatuses = []string{"fixing", "needs_part", "waiting_part", "part_arrived", "needs_pro", "pro_booked", "done"}

func clipAll(values []string, count, limit int) []string {
	out := []string{}
	for _, value := range values {
		if value = clip(value, limit); value != "" && len(out) < count {
			out = append(out, value)
		}
	}
	return out
}

func firstSentence(text string) string {
	if index := strings.IndexAny(text, ".!?"); index > 0 {
		return text[:index+1]
	}
	return text
}
