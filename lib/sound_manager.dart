// Location: lib/sound_manager.dart

import 'dart:convert';
import 'dart:typed_data'; // Added this import
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

class SoundManager {
  // --- PLAYER INSTANCES ---
  // Player for the looping background music
  static final AudioPlayer _musicPlayer = AudioPlayer();

  // Player for short, one-shot sound effects (click, correct, etc.)
  static final AudioPlayer _effectsPlayer = AudioPlayer();
  
  // Player dedicated to playing the longer speech audio from the cloud
  static final AudioPlayer _speechPlayer = AudioPlayer();
  
  // The on-device TTS engine (our fallback)
  static final FlutterTts _flutterTts = FlutterTts();

  // Cache for pre-fetched audio bytes
  static final Map<String, Uint8List> _audioCache = {};

  // --- INITIALIZATION ---
  static Future<void> initializeTts() async {
    // Configure the on-device fallback voice
    await _flutterTts.setLanguage("en-US");
    await _flutterTts.setSpeechRate(0.4);
    await _flutterTts.setPitch(1.0); // A more natural pitch
  }

  // --- SOUND EFFECTS ---
  static void playCorrectSound() {
    _effectsPlayer.play(AssetSource('audio/correct.mp3'));
  }
  static void playLevelUpSound() {
    _effectsPlayer.play(AssetSource('audio/level_up.mp3'));
  }
  static void playClickSound() {
    _effectsPlayer.play(AssetSource('audio/click.mp3'));
  }
    static void playWrongSound() {
    _effectsPlayer.play(AssetSource('audio/wrong_answer.mp3'));
  }

  // --- MUSIC CONTROL ---
  static bool _isMusicOn = true;
  static bool get isMusicOn => _isMusicOn;

  static Future<void> playBackgroundMusic() async {
    try {
      await _musicPlayer.setReleaseMode(ReleaseMode.loop);
      await _musicPlayer.play(AssetSource('audio/main_theme.mp3'));
      _isMusicOn = true;
    } catch (e) {
      print("Error playing background music: $e");
      _isMusicOn = false;
    }
  }

  static void toggleMusic() {
    if (_isMusicOn) {
      _musicPlayer.pause();
    } else {
      _musicPlayer.resume();
    }
    _isMusicOn = !_isMusicOn;
  }

  // --- SPEECH CONTROL ---

  // The new, robust stop function that handles both sources.
  static Future<void> stop() async {
    // Stop the cloud audio player
    await _speechPlayer.stop();
    // Stop the on-device TTS engine
    await _flutterTts.stop();
  }

  static Future<void> speak(String text, String lessonId) async {
    await stop();

    // 1. Check cache first
    if (_audioCache.containsKey(lessonId)) {
      print("Playing from cache: $lessonId");
      await _speechPlayer.play(BytesSource(_audioCache[lessonId]!));
      return;
    }

    try {
      print("Attempting to use Cloud TTS...");
      
      // 1. Get the current user and a fresh ID token.
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw Exception("Cannot use Cloud TTS without a logged-in user.");
      }
      final idToken = await user.getIdToken(true);

      // 2. Define the exact URL of your Cloud Function.
      final url = Uri.parse("https://us-central1-emma-g-adventures.cloudfunctions.net/synthesizeSpeech");

      // 3. Manually build the request headers with the auth token.
      final headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $idToken',
      };

      // 4. Manually build the request body.
      final body = jsonEncode({
        'data': {'text': text}
      });

      // 5. Make the HTTP POST request.
      final response = await http.post(url, headers: headers, body: body);

      // 6. Decode the response.
      if (response.statusCode == 200) {
        final responseData = jsonDecode(response.body);
        final audioBase64 = responseData['result']['audioBase64'] as String?;
        
        if (audioBase64 != null) {
          final audioBytes = base64Decode(audioBase64);
          _audioCache[lessonId] = audioBytes; // Cache the audio
          await _speechPlayer.play(BytesSource(audioBytes));
          print("✅ Successfully played Cloud TTS audio.");
          return; // Success!
        }
        throw Exception("Cloud TTS returned null audio.");
      } else {
        // If the server returned an error (like 401, 500, etc.)
        print("HTTP Error from TTS function: ${response.statusCode}");
        print("Response Body: ${response.body}");
        throw Exception("Cloud TTS function returned an error.");
      }
    } catch (e) {
      // --- IF CLOUD FAILS FOR ANY REASON, FALLBACK TO ON-DEVICE ---
      print("❌ Cloud TTS failed: $e. Falling back to on-device TTS.");
          await _flutterTts.speak(text);
        }
      }

  static Future<void> preFetchSpeech(String text, String lessonId) async { // Re-added static
    if (_audioCache.containsKey(lessonId)) {
      print("Audio for $lessonId already in cache. Skipping pre-fetch.");
      return;
    }

    try {
      print("Attempting to pre-fetch Cloud TTS for $lessonId...");
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        throw Exception("Cannot pre-fetch Cloud TTS without a logged-in user.");
      }
      final idToken = await user.getIdToken(true);

      final url = Uri.parse("https://us-central1-emma-g-adventures.cloudfunctions.net/synthesizeSpeech");
      final headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $idToken',
      };
      final body = jsonEncode({
        'data': {'text': text}
      });

      final response = await http.post(url, headers: headers, body: body);

      if (response.statusCode == 200) {
        final responseData = jsonDecode(response.body);
        final audioBase64 = responseData['result']['audioBase64'] as String?;
        
        if (audioBase64 != null) {
          final audioBytes = base64Decode(audioBase64);
          _audioCache[lessonId] = audioBytes; // Cache the audio
          print("✅ Successfully pre-fetched Cloud TTS audio for $lessonId.");
          return; // Success!
        }
        throw Exception("Cloud TTS pre-fetch returned null audio.");
      } else {
        print("HTTP Error from TTS function during pre-fetch: ${response.statusCode}");
        print("Response Body: ${response.body}");
        throw Exception("Cloud TTS pre-fetch function returned an error.");
      }
    } catch (e) {
      print("❌ Cloud TTS pre-fetch failed for $lessonId: $e.");
      // No fallback to on-device TTS for pre-fetching, as it's not critical path.
    }
  }

  static void clearCachedAudio(String lessonId) { // Re-added static
    _audioCache.remove(lessonId);
    print("Cleared cached audio for $lessonId.");
  }

  static void clearAllCachedAudio() { // Re-added static
    _audioCache.clear();
    print("Cleared all cached audio.");
  }
}