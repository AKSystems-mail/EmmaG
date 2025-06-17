// Location: lib/main.dart

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'subject_screen.dart';
import 'auth_screen.dart';
import 'badges_screen.dart';
import 'bonus_level_screen.dart';
import 'sound_manager.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const EmmaGAdventuresApp());
}

class EmmaGAdventuresApp extends StatelessWidget {
  const EmmaGAdventuresApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Emma G Adventures',
      theme: ThemeData(primarySwatch: Colors.blue, fontFamily: 'Faculty Glyphic'),
      home: const AuthGate(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class SubjectIconButton extends StatelessWidget {
  final String iconPath;
  final String subjectName;
  final VoidCallback onTap;

  const SubjectIconButton({
    super.key,
    required this.iconPath,
    required this.subjectName,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Use Expanded to make the image fill the available space in the grid cell
          Expanded(child: Image.asset(iconPath, fit: BoxFit.contain)),
          const SizedBox(height: 8),
          Text(
            subjectName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16, // Slightly smaller text for better fit
              fontWeight: FontWeight.bold,
              shadows: [Shadow(blurRadius: 5.0, color: Colors.black87)],
            ),
          ),
        ],
      ),
    );
  }
}

// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// THE UPGRADED MAIN MENU SCREEN WITH A ROBUST LAYOUT
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // 1. Background and Overlay
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.4)),

          // 2. Main Content Column
          SafeArea(
            child: Column(
              children: [
                // --- Title Area ---
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24.0),
                  child: Text(
                    'Choose Your Adventure!',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      shadows: [
                        Shadow(blurRadius: 10.0, color: Colors.black54),
                      ],
                    ),
                  ),
                ),

                // --- The Grid of Icons ---
                // Expanded tells the GridView to fill all available vertical space
                Expanded(
                  child: GridView.count(
                    crossAxisCount:
                        3, // We use 3 columns to fit everything nicely
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      // AFTER: Using block syntax to perform two actions

SubjectIconButton(
  iconPath: "assets/images/math_icon.png",
  subjectName: "Math",
  onTap: () {
    // 1. Play the sound first.
    SoundManager.playClickSound();
    // 2. Then, navigate to the new screen.
    Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Math")));
  },
),
SubjectIconButton(
  iconPath: "assets/images/language_arts_icon.png",
  subjectName: "Reading",
  onTap: () {
    SoundManager.playClickSound();
    Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Reading")));
  },
),
SubjectIconButton(
  iconPath: "assets/images/science_icon.png",
  subjectName: "Science",
  onTap: () {
    SoundManager.playClickSound();
    Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Science")));
  },
),
SubjectIconButton(
  iconPath: "assets/images/social_studies_icon.png",
  subjectName: "World",
  onTap: () {
    SoundManager.playClickSound();
    Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "World")));
  },
),
SubjectIconButton(
  iconPath: "assets/images/bonus_icon.png",
  subjectName: "Bonus!",
  onTap: () {
    SoundManager.playClickSound();
    Navigator.push(context, MaterialPageRoute(builder: (context) => const BonusLevelScreen()));
  },
),
                    ],
                  ),
                ),

                // --- Character Area ---
                Align(
                  alignment: Alignment.bottomLeft,
                  child: Container(
                    height: 200, // Adjusted height
                    child: Image.asset(
                      "assets/images/emma_character_transparent.png",
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 3. The "My Badges" Button (Top Right)
          // Positioned gives us explicit control over size and placement
          Positioned(
            top: 40,
            right: 16,
            child: SizedBox(
              width: 60, // Explicit size for the button
              height: 60,
              child: IconButton(
                padding: EdgeInsets.zero, // Remove default padding
                icon: Image.asset("assets/images/trophy_icon.png"),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const BadgesScreen(),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
