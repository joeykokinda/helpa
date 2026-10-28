package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const illustrateInstructions = `You redraw a person's own photo of a broken household thing as a friendly repair diagram they can follow.
Keep their exact machine, the same viewpoint and layout, so they instantly recognize it as theirs.
Style: clean hand-drawn ink outlines with flat, soft colors on warm paper, like a page from a friendly repair manual.
Mark only the one part that matters: a thick orange marker loop around it and one curved orange arrow showing the move.
Add at most one short handwritten label in plain English. If the photo already has an orange hand-drawn circle, the
problem is inside it. No people, no hands, no logos, no extra text.`

// illustrate asks Muse Image to redraw the person's photo with the part to fix circled and the move drawn on.
func illustrate(ctx context.Context, photo, appliance, part, move string) ([]byte, error) {
	prompt := fmt.Sprintf("This is my %s. Circle the %s and draw the move: %s. Label it %q.", appliance, part, move, clip(part, 30))
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-image-1.0",
		"instructions": illustrateInstructions,
		"input": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "input_text", "text": prompt},
			map[string]any{"type": "input_image", "image_url": photo},
		}}},
	})
	if err != nil {
		return nil, err
	}
	// Muse Image is priced per picture ($0.01), on top of the tokens createResponse already counted.
	spend.add(0.01)
	for _, item := range reply.Output {
		if item.Type == "image_generation_call" && item.Result != "" {
			return base64.StdEncoding.DecodeString(item.Result)
		}
	}
	return nil, fmt.Errorf("muse image returned no picture")
}

// handleIllustrate is POST /api/illustrate: one photo plus the step, back comes the photo drawn as a repair diagram.
func handleIllustrate(writer http.ResponseWriter, request *http.Request) {
	if !parseUpload(writer, request) {
		return
	}
	photos, err := readPhotos(request, "photo")
	if err != nil || len(photos) != 1 {
		http.Error(writer, "send exactly one photo", http.StatusBadRequest)
		return
	}
	appliance := clip(request.FormValue("appliance"), 60)
	part := clip(request.FormValue("part"), 60)
	move := clip(request.FormValue("move"), 120)
	if part == "" || move == "" {
		http.Error(writer, "say which part and what move", http.StatusBadRequest)
		return
	}
	if replayDir != "" {
		// A recorded drawing when there is one; otherwise nothing, and the app keeps the person's own photo.
		data, err := os.ReadFile(filepath.Join(replayDir, "illustrate.webp"))
		if err != nil {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		writer.Header().Set("Content-Type", "image/webp")
		writer.Write(data)
		return
	}
	if overBudget(writer, 0.9) {
		return
	}
	data, err := illustrate(request.Context(), photos[0], strings.TrimSpace(appliance), part, move)
	if err != nil {
		log.Printf("illustrate: %v", err)
		http.Error(writer, "couldn't draw it right now", http.StatusBadGateway)
		return
	}
	writer.Header().Set("Content-Type", http.DetectContentType(data))
	writer.Header().Set("Cache-Control", "private, max-age=3600")
	writer.Write(data)
}
