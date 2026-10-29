package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

const maxAskBytes = 64 << 10

const askInstructions = `You are Helpa, a friendly home repair helper. The person is asking a follow-up question about one
machine in their home. You get what you know about it: its identity, past fixes, and the chat so far.
Answer in at most 3 short, plain sentences for a total beginner, grounded in that machine and its history.
When you're told the step they're on right now (current_step), answer about doing that step, hands on the machine.
Never invent part numbers, prices or manual URLs; say you are not sure instead.
If something is unsafe for a beginner (gas, mains wiring, refrigerant, anything sparking or burning), say so and
tell them to call a pro.
Set start_fix to true only when the person describes a new problem that needs a hands-on fix, and put a one
sentence description of that problem in complaint (include the machine's brand and model). Otherwise start_fix
is false and complaint is empty. If you tell them to call a pro (safety, brakes, airbags, anything beyond a
beginner), start_fix is false.`

var askSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"answer", "start_fix", "complaint"},
	"properties": map[string]any{
		"answer":    map[string]any{"type": "string"},
		"start_fix": map[string]any{"type": "boolean"},
		"complaint": map[string]any{"type": "string"},
	},
}

type askMessage struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

// handleAsk answers a follow-up question about one saved machine, using what the phone remembers about it.
func handleAsk(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Machine  json.RawMessage `json:"machine"`
		Messages []askMessage    `json:"messages"`
		Question string          `json:"question"`
	}
	request.Body = http.MaxBytesReader(writer, request.Body, maxAskBytes)
	if err := json.NewDecoder(request.Body).Decode(&body); err != nil || strings.TrimSpace(body.Question) == "" {
		http.Error(writer, "send a question", http.StatusBadRequest)
		return
	}
	if replayDir == "" && overBudget(writer, 1) {
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	if replayDir != "" {
		var during struct {
			CurrentStep string `json:"current_step"`
		}
		if json.Unmarshal(body.Machine, &during) == nil && during.CurrentStep != "" {
			json.NewEncoder(writer).Encode(map[string]any{"answer": "Go gently on this one: " + strings.ToLower(strings.TrimSuffix(during.CurrentStep, ".")) + ". If it feels stuck, don't force it; tell me what you see and I'll help.", "start_fix": false, "complaint": ""})
			return
		}
		json.NewEncoder(writer).Encode(map[string]any{"answer": "Clean the lint screen before every load, and check the outside vent flap opens when it runs. If clothes still come out damp, I can walk you through cleaning the vent.", "start_fix": false, "complaint": ""})
		return
	}
	if len(body.Messages) > 12 {
		body.Messages = body.Messages[len(body.Messages)-12:]
	}
	var input []any
	input = append(input, userMessage("What I know about this machine:\n"+string(body.Machine)))
	for _, message := range body.Messages {
		role := "user"
		if message.Role == "helpa" {
			role = "assistant"
		}
		input = append(input, map[string]any{"type": "message", "role": role, "content": message.Text})
	}
	input = append(input, userMessage(body.Question))
	reply, err := createResponse(request.Context(), map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": askInstructions,
		"reasoning":    map[string]any{"effort": "low"},
		"input":        input,
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "answer", "schema": askSchema, "strict": true}},
	})
	if err != nil {
		log.Printf("ask: %v", err)
		http.Error(writer, "couldn't answer right now", http.StatusBadGateway)
		return
	}
	writer.Write([]byte(reply.text()))
}
