package main

import (
	"bufio"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// replayDir, when set, makes the API play back recorded agent runs instead of calling Meta,
// so the UI can be tested end to end for free. Fixtures are SSE files named after the appliance.
var replayDir = os.Getenv("HELPA_REPLAY")

var replayPause = map[string]time.Duration{
	"say": 900 * time.Millisecond, "search": 500 * time.Millisecond, "library": 600 * time.Millisecond,
	"parts": 700 * time.Millisecond, "plan": 1200 * time.Millisecond, "model": 1500 * time.Millisecond,
	"step_parts": 200 * time.Millisecond, "status": 300 * time.Millisecond,
	"identify": 2500 * time.Millisecond, "track": 300 * time.Millisecond, "question": 600 * time.Millisecond,
	"rig": 1200 * time.Millisecond, "model_error": 1500 * time.Millisecond,
}

// replayPace stretches the replay's pauses (HELPA_REPLAY_PACE=10 plays ten times slower), for filming the app
// frame by frame where the browser's clock runs slower than the wall clock.
func replayPace() float64 {
	if pace, err := strconv.ParseFloat(os.Getenv("HELPA_REPLAY_PACE"), 64); err == nil && pace > 0 {
		return pace
	}
	return 1
}

func replayFixture(complaint string) (string, error) {
	paths, err := filepath.Glob(filepath.Join(replayDir, "*.sse"))
	if err != nil || len(paths) == 0 {
		return "", fmt.Errorf("no fixtures in %s", replayDir)
	}
	lowered := strings.ToLower(complaint)
	for _, path := range paths {
		if strings.Contains(lowered, strings.TrimSuffix(filepath.Base(path), ".sse")) {
			return path, nil
		}
	}
	return paths[0], nil
}

// The "Try a sample" runs, recorded from the real pipeline by tools/record_samples.py and replayed for free.
//
//go:embed samples
var sampleFiles embed.FS

// openSample returns the recorded run for a sample id, or nil when there is none.
func openSample(id string) io.ReadCloser {
	if id == "" || strings.ContainsAny(id, "/.\\") {
		return nil
	}
	file, err := sampleFiles.Open("samples/" + id + ".sse")
	if err != nil {
		return nil
	}
	return file
}

func replayFix(request *http.Request, complaint string, session *fixSession, emit func(event)) {
	path, err := replayFixture(complaint)
	if err != nil {
		emit(event{"type": "error", "message": err.Error()})
		return
	}
	file, err := os.Open(path)
	if err != nil {
		emit(event{"type": "error", "message": err.Error()})
		return
	}
	defer file.Close()
	replayStream(request, file, session, emit)
}

// replayStream plays recorded events back at a lifelike pace; recorded questions wait for a real answer.
func replayStream(request *http.Request, recording io.Reader, session *fixSession, emit func(event)) {
	scanner := bufio.NewScanner(recording)
	scanner.Buffer(make([]byte, 0, 1<<20), 32<<20)
	for scanner.Scan() {
		line, found := strings.CutPrefix(scanner.Text(), "data: ")
		if !found {
			continue
		}
		var recorded event
		if json.Unmarshal([]byte(line), &recorded) != nil || recorded["type"] == "done" {
			continue
		}
		select {
		case <-request.Context().Done():
			return
		case <-time.After(time.Duration(float64(replayPause[fmt.Sprint(recorded["type"])]) * replayPace())):
		}
		if recorded["type"] == "question" {
			// Recorded questions wait for a real answer, so the question UI can be tested for free.
			recordedChoices, _ := recorded["choices"].([]any)
			var choices []string
			for _, choice := range recordedChoices {
				choices = append(choices, fmt.Sprint(choice))
			}
			session.ask(request.Context(), emit, fmt.Sprint(recorded["question"]), choices)
			continue
		}
		emit(recorded)
	}
}

var replayChecks = 0

// replayCheck alternates "not yet" and "done"; live checks open with a caught mistake so that UI can be tested too.
func replayCheck(writer http.ResponseWriter, live bool, part string) {
	replayChecks++
	part = strings.ToLower(strings.TrimSpace(part))
	if part == "" {
		part = "part"
	}
	// Recorded checks alternate a correction with a pass, worded for the part this step is about.
	result := map[string]any{"status": "INCOMPLETE", "done": false, "evidence": fmt.Sprintf("the %s hasn't moved yet", part), "feedback": fmt.Sprintf("Almost! The %s is still in place. Try the move again.", part), "mistake": ""}
	if live && replayChecks%2 == 1 {
		result["mistake"] = fmt.Sprintf("Close! That's next to it. Grab the %s itself.", part)
	}
	if replayChecks%2 == 0 {
		result = map[string]any{"status": "COMPLETED", "done": true, "evidence": fmt.Sprintf("the %s is done", part), "feedback": "That looks perfect. Nice work!", "mistake": ""}
	}
	time.Sleep(1500 * time.Millisecond)
	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(result)
}

func replayTranscribe(writer http.ResponseWriter) {
	time.Sleep(800 * time.Millisecond)
	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(map[string]string{"text": "My Whirlpool dryer takes forever to dry"})
}
