// Location: lib/sound_back_button.dart

import 'package:flutter/material.dart';
import 'sound_manager.dart';

class SoundBackButton extends StatelessWidget {
  final Color? color; // Optional color for the icon

  const SoundBackButton({super.key, this.color});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(Icons.arrow_back, color: color),
      onPressed: () {
        // 1. Stop any playing speech FIRST.
        SoundManager.stop();
        // 2. Then, play the click sound.
        SoundManager.playClickSound();
        // 3. Finally, navigate back.
        Navigator.of(context).pop();
      },
    );
  }
}