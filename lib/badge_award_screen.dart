// Location: lib/badge_award_screen.dart

import 'package:flutter/material.dart' hide Badge;
import 'package:confetti/confetti.dart';
import 'badges_screen.dart'; // We can reuse the Badge data class
import 'textured_button.dart';
import 'sound_manager.dart';

class BadgeAwardScreen extends StatefulWidget {
  final Badge badge;

  const BadgeAwardScreen({super.key, required this.badge});

  @override
  State<BadgeAwardScreen> createState() => _BadgeAwardScreenState();
}

class _BadgeAwardScreenState extends State<BadgeAwardScreen> {
  late ConfettiController _confettiController;

  @override
  void initState() {
    super.initState();
    _confettiController = ConfettiController(duration: const Duration(seconds: 2));
    // Play the level up sound and the confetti when the screen loads
    SoundManager.playLevelUpSound();
    _confettiController.play();
  }

  @override
  void dispose() {
    // Important: dispose of the controller when the screen is removed
    _confettiController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Background and Overlay
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/trophy_room.png"), // Use the trophy room background
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.5)),

          // Main Content
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text(
                  "You Earned a Badge!",
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    shadows: [Shadow(blurRadius: 2, color: Colors.black87)],
                  ),
                ),
                const SizedBox(height: 30),
                // Display the badge image, make it large
                Image.network(
                  widget.badge.imageUrl,
                  height: 180,
                  fit: BoxFit.contain,
                  // Show a spinner while the badge image loads
                  loadingBuilder: (context, child, progress) {
                    return progress == null ? child : const CircularProgressIndicator();
                  },
                ),
                const SizedBox(height: 20),
                Text(
                  widget.badge.name,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.amber, // Make the name stand out
                  ),
                ),
                const SizedBox(height: 50),
                TexturedButton(
                  text: "Awesome!",
                  onPressed: () {
                    Navigator.of(context).pop(); // Close this screen
                  },
                  texture: ButtonTexture.wood,
                  fontSize: 20,
                  fixedSize: const Size(220, 60),
                ),
              ],
            ),
          ),

          // Confetti Widget - aligned to the top center
          Align(
            alignment: Alignment.topCenter,
            child: ConfettiWidget(
              confettiController: _confettiController,
              blastDirectionality: BlastDirectionality.explosive,
              shouldLoop: false,
              numberOfParticles: 30,
              gravity: 0.3,
              emissionFrequency: 0.05,
            ),
          ),
        ],
      ),
    );
  }
}