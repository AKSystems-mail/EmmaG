// Location: lib/sound_manager.dart

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_tts/flutter_tts.dart';

class SoundManager {
  // Create a single, reusable audio player instance.
  static final AudioPlayer _player = AudioPlayer();
  static final FlutterTts _flutterTts = FlutterTts();
    static Future<void> initializeTts() async {
    // Set language and a slightly slower speech rate suitable for children
    await _flutterTts.setLanguage("en-US");
    await _flutterTts.setSpeechRate(0.5); // 0.5 is normal, 0.4 is a bit slower
    await _flutterTts.setPitch(2.0);
  }

  static void playCorrectSound() {
    _player.play(AssetSource('audio/correct.mp3'));
  }

  static void playLevelUpSound() {
    _player.play(AssetSource('audio/level_up.mp3'));
  }

  static void playClickSound() {
    _player.play(AssetSource('audio/click.mp3'));
  }
    // ADD THIS: The new function to speak text
  static Future<void> speak(String text) async {
    // Stop any previous speech before starting new speech
    await _flutterTts.stop();
    // Call the speak method
    await _flutterTts.speak(text);
  }
}