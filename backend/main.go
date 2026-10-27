package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"strings"
	"sync"
)

const maxUploadBytes = 40 << 20

func main() {
	if metaAPIKey == "" && replayDir == "" {
		log.Fatal("META_API_KEY is not set (or set HELPA_REPLAY to a fixtures folder)")
	}
	if replayDir != "" {
		log.Printf("REPLAY MODE: serving recorded runs from %s, no Meta API calls", replayDir)
	}
	if len(os.Args) > 1 && os.Args[1] == "choreograph-library" {
		if err := choreographLibrary(context.Background()); err != nil {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "build-library" {
		if err := buildLibrary(context.Background(), os.Args[2:]); err != nil {
			log.Fatal(err)
		}
		return
	}
	http.HandleFunc("POST /api/fix", handleFix)
	http.HandleFunc("POST /api/answer", handleAnswer)
	http.HandleFunc("POST /api/check", handleCheck)
	http.HandleFunc("POST /api/transcribe", handleTranscribe)
	http.HandleFunc("GET /api/library/{id}", func(writer http.ResponseWriter, request *http.Request) {
		entry := findLibraryEntry(request.PathValue("id"))
		if entry == nil {
			http.NotFound(writer, request)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		json.NewEncoder(writer).Encode(entry)
	})
	http.HandleFunc("GET /api/health", func(writer http.ResponseWriter, _ *http.Request) { writer.Write([]byte("ok")) })
	address := os.Getenv("ADDR")
	if replayDir != "" && address == "" {
		address = "127.0.0.1:8096"
	}
	if address == "" {
		address = "127.0.0.1:8095"
	}
	log.Printf("helpa listening on %s", address)
	log.Fatal(http.ListenAndServe(address, withCORS(http.DefaultServeMux)))
}

// withCORS lets the app call the API from its own origin (Vercel or the dev server).
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

// readPhotos turns the uploaded image files under field into data URLs.
func readPhotos(request *http.Request, field string) ([]string, error) {
	var photos []string
	for _, header := range request.MultipartForm.File[field] {
		file, err := header.Open()
		if err != nil {
			return nil, err
		}
		data, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			return nil, err
		}
		mime := http.DetectContentType(data)
		if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
			return nil, fmt.Errorf("photos must be jpeg, png or webp, got %s", mime)
		}
		photos = append(photos, "data:"+mime+";base64,"+base64.StdEncoding.EncodeToString(data))
	}
	return photos, nil
}

func parseUpload(writer http.ResponseWriter, request *http.Request) bool {
	request.Body = http.MaxBytesReader(writer, request.Body, maxUploadBytes)
	if err := request.ParseMultipartForm(maxUploadBytes); err != nil {
		http.Error(writer, "bad upload: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

// handleFix takes optional photos plus a description and streams agent events as SSE.
func handleFix(writer http.ResponseWriter, request *http.Request) {
	if !parseUpload(writer, request) {
		return
	}
	complaint := request.FormValue("complaint")
	photos, err := readPhotos(request, "photos")
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}
	if len(photos) == 0 && complaint == "" {
		http.Error(writer, "send a photo or describe the problem", http.StatusBadRequest)
		return
	}
	if complaint == "" {
		complaint = "Something is wrong with this. Work out what it is from the photos."
	}

	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := writer.(http.Flusher)
	var lock sync.Mutex
	emit := func(payload event) {
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}
		lock.Lock()
		defer lock.Unlock()
		fmt.Fprintf(writer, "data: %s\n\n", data)
		if flusher != nil {
			flusher.Flush()
		}
	}
	session := newSession()
	defer session.close()
	if replayDir != "" {
		replayFix(request, complaint, session, emit)
		emit(event{"type": "done"})
		return
	}
	if err := runPipeline(request.Context(), photos, complaint, session, emit); err != nil {
		log.Printf("agent: %v", err)
		emit(event{"type": "error", "message": err.Error()})
	}
	emit(event{"type": "done"})
}

// handleAnswer feeds the user's answer to a question into the fix stream that is waiting for it.
func handleAnswer(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Session string `json:"session"`
		Answer  string `json:"answer"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 4096)).Decode(&body); err != nil {
		http.Error(writer, "send {session, answer}", http.StatusBadRequest)
		return
	}
	answer := strings.TrimSpace(body.Answer)
	if answer == "" || len(answer) > 300 {
		http.Error(writer, "answer must be 1 to 300 characters", http.StatusBadRequest)
		return
	}
	if !answerSession(body.Session, answer) {
		http.Error(writer, "that question is no longer waiting for an answer", http.StatusConflict)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

// handleCheck judges a photo taken after a step.
func handleCheck(writer http.ResponseWriter, request *http.Request) {
	if !parseUpload(writer, request) {
		return
	}
	if replayDir != "" {
		replayCheck(writer)
		return
	}
	photos, err := readPhotos(request, "photo")
	if err != nil || len(photos) != 1 {
		http.Error(writer, "send exactly one photo", http.StatusBadRequest)
		return
	}
	result, err := checkStep(request.Context(), photos[0], request.FormValue("instruction"), request.FormValue("check"))
	if err != nil {
		log.Printf("check: %v", err)
		http.Error(writer, err.Error(), http.StatusBadGateway)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Write(result)
}

// handleTranscribe forwards a 16 kHz mono WAV to Muse Voice Transcribe and returns {"text": ...}.
func handleTranscribe(writer http.ResponseWriter, request *http.Request) {
	if !parseUpload(writer, request) {
		return
	}
	if replayDir != "" {
		replayTranscribe(writer)
		return
	}
	file, _, err := request.FormFile("audio")
	if err != nil {
		http.Error(writer, "send audio", http.StatusBadRequest)
		return
	}
	defer file.Close()

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	settingsHeader := textproto.MIMEHeader{}
	settingsHeader.Set("Content-Disposition", `form-data; name="request"`)
	settingsHeader.Set("Content-Type", "application/json")
	settings, _ := form.CreatePart(settingsHeader)
	settings.Write([]byte(`{"mode":"DIARIZATION","model":"muse-voice-transcribe-1.0","audioEncoding":"WAV"}`))
	audio, _ := form.CreateFormFile("audio", "speech.wav")
	if _, err := io.Copy(audio, file); err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}
	form.Close()

	upstream, err := http.NewRequestWithContext(request.Context(), http.MethodPost, metaBaseURL+"/asr/transcribe", &body)
	if err != nil {
		http.Error(writer, err.Error(), http.StatusInternalServerError)
		return
	}
	upstream.Header.Set("Authorization", "Bearer "+metaAPIKey)
	upstream.Header.Set("Content-Type", form.FormDataContentType())
	reply, err := http.DefaultClient.Do(upstream)
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadGateway)
		return
	}
	defer reply.Body.Close()
	data, _ := io.ReadAll(reply.Body)
	if reply.StatusCode != http.StatusOK {
		log.Printf("transcribe %d: %s", reply.StatusCode, data)
		http.Error(writer, "transcription failed", http.StatusBadGateway)
		return
	}
	var parsed struct {
		Transcript string `json:"transcript"`
	}
	json.Unmarshal(data, &parsed)
	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(map[string]string{"text": parsed.Transcript})
}
