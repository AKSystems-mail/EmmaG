// Location: lib/sound_manager.dart

import 'package:audioplayers/audioplayers.dart';

class SoundManager {
  // Create a single, reusable audio player instance.
  static final AudioPlayer _player = AudioPlayer();

  static void playCorrectSound() {
    _player.play(AssetSource('audio/correct.mp3'));
  }

  static void playLevelUpSound() {
    _player.play(AssetSource('audio/level_up.mp3'));
  }

  static void playClickSound() {
    _player.play(AssetSource('audio/click.mp3'));
  }
}