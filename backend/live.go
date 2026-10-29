package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const maxLocatePhrases = 4

// handleLocate finds a part on a live camera frame with SAM 3.1. The phone sends a few names for the part,
// best first, and gets back the first one SAM can see, so it can keep using that name.
func handleLocate(writer http.ResponseWriter, request *http.Request) {
	if !parseUpload(writer, request) {
		return
	}
	var phrases []string
	for _, phrase := range request.MultipartForm.Value["phrase"] {
		phrase = strings.TrimSpace(phrase)
		if phrase != "" && len(phrase) <= 60 && len(phrases) < maxLocatePhrases {
			phrases = append(phrases, phrase)
		}
	}
	// A tap on the part: SAM's point prompt, "x,y,width,height" in the frame's pixels.
	if point := request.FormValue("point"); point != "" {
		prompt, ok := pointPrompt(point)
		if !ok {
			http.Error(writer, "point is x,y,width,height in pixels", http.StatusBadRequest)
			return
		}
		phrases = []string{prompt}
	}
	if len(phrases) == 0 {
		http.Error(writer, "send at least one phrase", http.StatusBadRequest)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	if replayDir != "" {
		fixture := "locate.sam"
		if request.FormValue("kind") == "label" {
			fixture = "label.sam"
		}
		recorded, _ := os.ReadFile(filepath.Join(replayDir, fixture))
		json.NewEncoder(writer).Encode(map[string]string{"sam": strings.TrimSpace(string(recorded)), "phrase": phrases[0]})
		return
	}
	if overBudget(writer, 0.8) {
		return
	}
	photos, err := readPhotos(request, "photo")
	if err != nil || len(photos) != 1 {
		http.Error(writer, "send exactly one photo", http.StatusBadRequest)
		return
	}
	// All names at once, so a miss costs one SAM round trip instead of one per name; the best-ranked hit wins.
	results := make([]string, len(phrases))
	failures := make([]error, len(phrases))
	var wait sync.WaitGroup
	for index, phrase := range phrases {
		wait.Add(1)
		go func() {
			defer wait.Done()
			defer recoverLog("locate")
			results[index], failures[index] = segment(request.Context(), photos[0], phrase)
		}()
	}
	wait.Wait()
	for index, phrase := range phrases {
		if strings.Contains(results[index], "<|mask") {
			log.Printf("locate %q: found", phrase)
			json.NewEncoder(writer).Encode(map[string]string{"sam": results[index], "phrase": phrase})
			return
		}
	}
	for index, failure := range failures {
		if failure != nil {
			log.Printf("locate %q: %v", phrases[index], failure)
		}
	}
	if failures[0] != nil {
		http.Error(writer, "couldn't look right now", http.StatusBadGateway)
		return
	}
	log.Printf("locate %q: nothing", phrases)
	json.NewEncoder(writer).Encode(map[string]string{"sam": "", "phrase": ""})
}

// pointPrompt turns "x,y,width,height" into SAM 3.1's geometric prompt for one object on one frame.
func pointPrompt(point string) (string, bool) {
	var x, y, width, height int
	if count, err := fmt.Sscanf(point, "%d,%d,%d,%d", &x, &y, &width, &height); err != nil || count != 4 {
		return "", false
	}
	if width <= 0 || height <= 0 || width > 8192 || height > 8192 || x < 0 || y < 0 || x >= width || y >= height {
		return "", false
	}
	return fmt.Sprintf("<0f>0<|point;x=%d;y=%d;w=%d;h=%d|>", x, y, width, height), true
}

var labelSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"found", "brand", "model_number", "serial", "vin", "description"},
	"properties": map[string]any{
		"found":        map[string]any{"type": "boolean", "description": "True only if a model number or VIN is clearly readable."},
		"brand":        map[string]any{"type": "string"},
		"model_number": map[string]any{"type": "string", "description": "Exactly as printed, empty if not readable."},
		"serial":       map[string]any{"type": "string"},
		"vin":          map[string]any{"type": "string", "description": "17 characters, empty unless this is a vehicle VIN."},
		"description":  map[string]any{"type": "string", "description": "What this is in plain words, e.g. 'Whirlpool top-load washer' or, decoded from a VIN, '2015 Toyota Camry'."},
	},
}

const labelInstructions = `You read appliance model stickers and vehicle VIN plates from a phone photo.
Copy the model number, serial number and VIN exactly as printed; never guess a character you cannot read,
and set found to false if the model number (or VIN) is not clearly readable. For a VIN, decode the maker,
model and model year into description. For an appliance, say the brand and kind of appliance.`

// readLabel reads the identity off a cropped photo of a model sticker or VIN plate.
func readLabel(ctx context.Context, photo string) (json.RawMessage, error) {
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": labelInstructions,
		"reasoning":    map[string]any{"effort": "low"},
		"input":        []any{userMessage("Read this label.", photo)},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "label", "schema": labelSchema, "strict": true}},
	})
	if err != nil {
		return nil, err
	}
	return json.RawMessage(reply.text()), nil
}

func handleReadLabel(writer http.ResponseWriter, request *http.Request) {
	if !parseUpload(writer, request) {
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	if replayDir != "" {
		json.NewEncoder(writer).Encode(map[string]any{"found": true, "brand": "Whirlpool", "model_number": "WDF520PADM7", "serial": "F91234567", "vin": "", "description": "Whirlpool dishwasher"})
		return
	}
	if overBudget(writer, 1) {
		return
	}
	photos, err := readPhotos(request, "photo")
	if err != nil || len(photos) != 1 {
		http.Error(writer, "send exactly one photo", http.StatusBadRequest)
		return
	}
	result, err := readLabel(request.Context(), photos[0])
	if err != nil {
		log.Printf("read label: %v", err)
		http.Error(writer, "couldn't read that label", http.StatusBadGateway)
		return
	}
	writer.Write(result)
}
