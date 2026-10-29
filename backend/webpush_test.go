package main

import (
	"crypto/ecdh"
	"testing"
)

// RFC 8291, Appendix A: the worked example must come out byte for byte.
func TestEncryptPushRFC8291(t *testing.T) {
	var subscription pushSubscription
	subscription.Keys.P256dh = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
	subscription.Keys.Auth = "BTBZMqHH6r4Tts7J_aSIgg"
	senderKey, _ := decodeB64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")
	sender, err := ecdh.P256().NewPrivateKey(senderKey)
	if err != nil {
		t.Fatal(err)
	}
	salt, _ := decodeB64("DGv6ra1nlYgDCS1FRnbzlw")
	body, err := encryptPush([]byte("When I grow up, I want to be a watermelon"), subscription, sender, salt)
	if err != nil {
		t.Fatal(err)
	}
	want := "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
	if got := b64.EncodeToString(body); got != want {
		t.Errorf("encrypted body differs from RFC 8291\n got %s\nwant %s", got, want)
	}
}

func TestVapidToken(t *testing.T) {
	dataDir = t.TempDir()
	token, err := vapidToken("https://fcm.googleapis.com/fcm/send/abc")
	if err != nil || len(vapidPublic()) != 87 {
		t.Fatalf("token %q err %v key %q", token, err, vapidPublic())
	}
}
