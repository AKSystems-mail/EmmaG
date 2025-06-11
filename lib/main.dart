import 'package:flutter/material.dart';

void main() {
  runApp(const EmmaGAdventuresApp());
}

class EmmaGAdventuresApp extends StatelessWidget {
  const EmmaGAdventuresApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Emma G Adventures',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        fontFamily: 'Nunito', // We can add a custom font later!
      ),
      home: const MainMenuScreen(),
      debugShowCheckedModeBanner: false, // Hides the debug banner
    );
  }
}

class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // We use a Stack to layer widgets on top of each other (like the background, character, and menu)
      body: Stack(
        children: [
          // 1. The Background Image
          // This Container fills the entire screen and displays our background.
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"), // Your background image
                fit: BoxFit.cover, // This makes the image cover the whole screen
              ),
            ),
          ),

          // 2. The Main Content (Title and Subject Icons)
          // We use a SafeArea to avoid UI elements being hidden by phone notches.
          SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // TODO: Add a beautiful title here
                  const Text(
                    'Choose Your Adventure!',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      shadows: [
                        Shadow(blurRadius: 10.0, color: Colors.black54)
                      ],
                    ),
                  ),
                  const SizedBox(height: 40),

                  // TODO: Add the subject icons here
                  // For now, a placeholder
                  const Text(
                    'Icons will go here',
                    style: TextStyle(color: Colors.white),
                  ),
                ],
              ),
            ),
          ),

          // 3. The Character Image (Optional, but a great touch!)
          // This aligns your Emma G character to the bottom of the screen.
// After
Align(
  alignment: Alignment.bottomCenter,
  child: Container(
    height: 250,
    child: Image.asset(
      "assets/images/emma_character.png", // The NEW transparent image
      fit: BoxFit.contain,
    ),
  ),
),
        ],
      ),
    );
  }
}