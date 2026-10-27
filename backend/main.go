package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
)

const maxUploadBytes = 40 << 20

func main() {
	if metaAPIKey == "" {
		log.Fatal("META_API_KEY is not set")
	}
	http.HandleFunc("POST /api/fix", handleFix)
	address := os.Getenv("ADDR")
	if address == "" {
		address = "127.0.0.1:8095"
	}
	log.Printf("helpa listening on %s", address)
	log.Fatal(http.ListenAndServe(address, nil))
}

// handleFix takes multipart photos plus a complaint and streams agent events as SSE.
func handleFix(writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, maxUploadBytes)
	if err := request.ParseMultipartForm(maxUploadBytes); err != nil {
		http.Error(writer, "bad upload: "+err.Error(), http.StatusBadRequest)
		return
	}
	complaint := request.FormValue("complaint")
	var photos []string
	for _, header := range request.MultipartForm.File["photos"] {
		file, err := header.Open()
		if err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		data, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		mime := http.DetectContentType(data)
		if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
			http.Error(writer, "photos must be jpeg, png or webp", http.StatusBadRequest)
			return
		}
		photos = append(photos, "data:"+mime+";base64,"+base64.StdEncoding.EncodeToString(data))
	}
	if len(photos) == 0 || complaint == "" {
		http.Error(writer, "need at least one photo and a complaint", http.StatusBadRequest)
		return
	}

	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
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
	if err := runAgent(request.Context(), photos, complaint, emit); err != nil {
		log.Printf("agent: %v", err)
		emit(event{"type": "error", "message": err.Error()})
	}
	emit(event{"type": "done"})
}
