// Location: lib/sound_manager.dart

import 'dart:convert';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:cloud_functions/cloud_functions.dart';

class SoundManager {
  // --- PLAYER INSTANCES ---
  // Player for short, one-shot sound effects (click, correct, etc.)
  static final AudioPlayer _effectsPlayer = AudioPlayer();
  
  // Player dedicated to playing the longer speech audio from the cloud
  static final AudioPlayer _speechPlayer = AudioPlayer();
  
  // The on-device TTS engine (our fallback)
  static final FlutterTts _flutterTts = FlutterTts();

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

  // --- SPEECH CONTROL ---

  // The new, robust stop function that handles both sources.
  static Future<void> stop() async {
    // Stop the cloud audio player
    await _speechPlayer.stop();
    // Stop the on-device TTS engine
    await _flutterTts.stop();
    print("All speech stopped.");
  }

  // The hybrid speak function that tries cloud first.
  static Future<void> speak(String text) async {
    // Stop any currently playing speech before starting new speech.
    await stop();

    try {
      // --- 1. TRY THE CLOUD FIRST ---
      print("Attempting to use Cloud TTS...");
      final callable = FirebaseFunctions.instance.httpsCallable('synthesizeSpeech');
      final result = await callable.call<Map<String, dynamic>>({'text': text});
      
      final audioBase64 = result.data['audioBase64'] as String?;
      if (audioBase64 != null) {
        final audioBytes = base64Decode(audioBase64);
        // Play the high-quality audio using the dedicated speech player
        await _speechPlayer.play(BytesSource(audioBytes));
        print("✅ Successfully played Cloud TTS audio.");
        return; // Success! We are done.
      }
      print("⚠️ Cloud TTS returned no audio, falling back to on-device TTS.");
      throw Exception("Cloud TTS returned null audio."); // Force fallback

    } catch (e) {
      // --- 2. IF CLOUD FAILS, FALLBACK TO ON-DEVICE ---
      print("❌ Cloud TTS failed: $e. Falling back to on-device TTS.");
      await _flutterTts.speak(text);
    }
  }
}