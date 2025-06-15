// Location: lib/main.dart

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'subject_screen.dart';
import 'auth_screen.dart';
import 'badges_screen.dart';
import 'bonus_level_screen.dart'; // Make sure this import is here

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
      theme: ThemeData(primarySwatch: Colors.blue, fontFamily: 'Nunito'),
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
          Image.asset(iconPath, width: 110, height: 110),
          const SizedBox(height: 8),
          Text(
            subjectName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
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
// THE CORRECTED AND UPGRADED MAIN MENU SCREEN
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // 1. Background and Overlay (Unchanged)
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.4)),

          // 2. Main Content Area
          SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text(
                    'Choose Your Adventure!',
                    style: TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      shadows: [Shadow(blurRadius: 10.0, color: Colors.black54)],
                    ),
                  ),
                  const SizedBox(height: 40),

                  // --- NEW: A GridView for the icons ---
                  Container(
                    height: 320, // Height of the grid area
                    padding: const EdgeInsets.symmetric(horizontal: 20.0),
                    child: GridView.count(
                      crossAxisCount: 2, // 2 icons per row
                      crossAxisSpacing: 20,
                      mainAxisSpacing: 20,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        SubjectIconButton(
                          iconPath: "assets/images/math_icon.png",
                          subjectName: "Math",
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Math"))),
                        ),
                        SubjectIconButton(
                          iconPath: "assets/images/language_arts_icon.png",
                          subjectName: "Reading",
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Reading"))),
                        ),
                        SubjectIconButton(
                          iconPath: "assets/images/science_icon.png",
                          subjectName: "Science",
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Science"))),
                        ),
                        SubjectIconButton(
                          iconPath: "assets/images/social_studies_icon.png",
                          subjectName: "World",
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "World"))),
                        ),
SubjectIconButton(
  iconPath: "assets/images/bonus_icon.png",
  subjectName: "Bonus!",
  onTap: () {
    // Update this navigation
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const BonusLevelScreen()),
    );
  },
),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 3. The "My Badges" Button (Top Right)
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(10.0),
                child: IconButton(
                  icon: Image.asset("assets/images/trophy_icon.png"),
                  iconSize: 0.05,
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const BadgesScreen()),
                    );
                  },
                ),
              ),
            ),
          ),

          // 4. The Character Image (Bottom Center)
          Align(
            alignment: Alignment.bottomLeft,
            child: Container(
              height: 250,
              child: Image.asset(
                "assets/images/emma_character_transparent.png",
                fit: BoxFit.contain,
              ),
            ),
          ),
        ],
      ),
    );
  }
}