package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Web Push with the standard library: payloads encrypted per RFC 8291 (aes128gcm), requests signed per RFC 8292
// (VAPID). It's how Helpa taps you on the shoulder when the part arrives, even with the app closed.

type pushSubscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

var b64 = base64.RawURLEncoding

func decodeB64(text string) ([]byte, error) {
	return b64.DecodeString(strings.TrimRight(text, "="))
}

// encryptPush encrypts payload for one subscription. The sender key and salt are parameters so the RFC's test
// vector can check it; real sends use fresh random ones.
func encryptPush(payload []byte, subscription pushSubscription, sender *ecdh.PrivateKey, salt []byte) ([]byte, error) {
	receiverKey, err := decodeB64(subscription.Keys.P256dh)
	if err != nil {
		return nil, err
	}
	authSecret, err := decodeB64(subscription.Keys.Auth)
	if err != nil {
		return nil, err
	}
	receiver, err := ecdh.P256().NewPublicKey(receiverKey)
	if err != nil {
		return nil, err
	}
	shared, err := sender.ECDH(receiver)
	if err != nil {
		return nil, err
	}
	senderPublic := sender.PublicKey().Bytes()
	// IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
	keyInfo := append(append([]byte("WebPush: info\x00"), receiverKey...), senderPublic...)
	ikm, err := hkdf.Key(sha256.New, shared, authSecret, string(keyInfo), 32)
	if err != nil {
		return nil, err
	}
	contentKey, err := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
	if err != nil {
		return nil, err
	}
	nonce, err := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(contentKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	// One record: the payload, then the 0x02 delimiter that marks the last record.
	sealed := gcm.Seal(nil, nonce, append(append([]byte{}, payload...), 0x02), nil)
	var body bytes.Buffer
	body.Write(salt)
	binary.Write(&body, binary.BigEndian, uint32(4096))
	body.WriteByte(byte(len(senderPublic)))
	body.Write(senderPublic)
	body.Write(sealed)
	return body.Bytes(), nil
}

/* ---------- VAPID ---------- */

var (
	vapidOnce sync.Once
	vapidKey  *ecdsa.PrivateKey
)

// vapid loads the server's signing key from the data folder, making one on first use.
func vapid() *ecdsa.PrivateKey {
	vapidOnce.Do(func() {
		path := filepath.Join(dataDir, "vapid.pem")
		if data, err := os.ReadFile(path); err == nil {
			if block, _ := pem.Decode(data); block != nil {
				if key, err := x509.ParseECPrivateKey(block.Bytes); err == nil {
					vapidKey = key
					return
				}
			}
		}
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			log.Printf("push: no key: %v", err)
			return
		}
		vapidKey = key
		der, _ := x509.MarshalECPrivateKey(key)
		os.MkdirAll(dataDir, 0o700)
		if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der}), 0o600); err != nil {
			log.Printf("push: couldn't save the key, notifications reset on restart: %v", err)
		}
	})
	return vapidKey
}

func vapidPublic() string {
	key := vapid()
	if key == nil {
		return ""
	}
	public, err := key.PublicKey.ECDH()
	if err != nil {
		return ""
	}
	return b64.EncodeToString(public.Bytes())
}

// vapidToken is the ES256 JWT the push service checks, scoped to the endpoint's origin.
func vapidToken(endpoint string) (string, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	header := b64.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, _ := json.Marshal(map[string]any{"aud": parsed.Scheme + "://" + parsed.Host, "exp": time.Now().Add(12 * time.Hour).Unix(),
		"sub": envOr("HELPA_PUSH_CONTACT", "mailto:helpa@example.com")})
	signing := header + "." + b64.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, vapid(), digest[:])
	if err != nil {
		return "", err
	}
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	s.FillBytes(signature[32:])
	return signing + "." + b64.EncodeToString(signature), nil
}

// errGone means the subscription expired or was revoked; the caller forgets it.
var errGone = fmt.Errorf("push subscription gone")

// sendPush delivers one notification: title, body, and the app path to open when it's tapped.
func sendPush(raw json.RawMessage, title, body, path string) error {
	var subscription pushSubscription
	if err := json.Unmarshal(raw, &subscription); err != nil || subscription.Endpoint == "" {
		return fmt.Errorf("no push subscription")
	}
	if vapid() == nil {
		return fmt.Errorf("no push key")
	}
	payload, _ := json.Marshal(map[string]string{"title": title, "body": body, "url": path})
	sender, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	salt := make([]byte, 16)
	rand.Read(salt)
	encrypted, err := encryptPush(payload, subscription, sender, salt)
	if err != nil {
		return err
	}
	token, err := vapidToken(subscription.Endpoint)
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, subscription.Endpoint, bytes.NewReader(encrypted))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Encoding", "aes128gcm")
	request.Header.Set("Content-Type", "application/octet-stream")
	request.Header.Set("TTL", "86400")
	request.Header.Set("Urgency", "high")
	request.Header.Set("Authorization", "vapid t="+token+", k="+vapidPublic())
	client := &http.Client{Timeout: 15 * time.Second}
	reply, err := client.Do(request)
	if err != nil {
		return err
	}
	defer reply.Body.Close()
	if reply.StatusCode == http.StatusGone || reply.StatusCode == http.StatusNotFound {
		return errGone
	}
	if reply.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(reply.Body, 500))
		return fmt.Errorf("push %d: %s", reply.StatusCode, data)
	}
	return nil
}

func handlePushKey(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, map[string]string{"key": vapidPublic()})
}

func handlePushSubscribe(writer http.ResponseWriter, request *http.Request) {
	device, ok := deviceOf(writer, request)
	if !ok {
		return
	}
	var subscription pushSubscription
	if !readBody(writer, request, &subscription) {
		return
	}
	if !strings.HasPrefix(subscription.Endpoint, "https://") || subscription.Keys.P256dh == "" || subscription.Keys.Auth == "" {
		http.Error(writer, "not a push subscription", http.StatusBadRequest)
		return
	}
	raw, _ := json.Marshal(subscription)
	err := jobs.update(device, func(file *deviceFile) error {
		file.Push = raw
		return nil
	})
	if err != nil {
		http.Error(writer, "couldn't save that", http.StatusInternalServerError)
		return
	}
	writeJSON(writer, map[string]bool{"ok": true})
}
