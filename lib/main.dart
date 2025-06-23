// Location: lib/main.dart

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:audioplayers/audioplayers.dart'; // Import the audio players package
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
      theme: ThemeData(
        primarySwatch: Colors.blue,
        fontFamily: 'Nunito', // Your chosen font
      ),
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
          Expanded(child: Image.asset(iconPath, fit: BoxFit.contain)),
          const SizedBox(height: 8),
          Text(
            subjectName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
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
// UPGRADED TO A STATEFULWIDGET FOR MUSIC CONTROL
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
class MainMenuScreen extends StatefulWidget {
  const MainMenuScreen({super.key});

  @override
  State<MainMenuScreen> createState() => _MainMenuScreenState();
}

class _MainMenuScreenState extends State<MainMenuScreen> {
  // Create an audio player instance specifically for the background music
  final AudioPlayer _musicPlayer = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _playBackgroundMusic();
  }

  void _playBackgroundMusic() async {
    // Set the player to loop the audio
    await _musicPlayer.setReleaseMode(ReleaseMode.loop);
    // Play the music from your assets
    await _musicPlayer.play(AssetSource('audio/main_theme.mp3'));
  }

  @override
  void dispose() {
    // It's crucial to stop and dispose of the player when the screen is removed
    _musicPlayer.stop();
    _musicPlayer.dispose();
    super.dispose();
  }

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
                // --- NEW: Title Area with Image ---
                Padding(
                  padding: const EdgeInsets.only(top: 40.0), // Add top padding
                  child: SizedBox(
                    height: 150, // Give the title image a defined height
                    child: Image.asset("assets/images/EGA_title.png"),
                  ),
                ),
                const Text(
                  'Choose Your Adventure!',
                  style: TextStyle(
                    fontSize: 22, // Smaller font size
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    shadows: [Shadow(blurRadius: 10.0, color: Colors.black54)],
                  ),
                ),
                const SizedBox(height: 20), // Adjust spacing

                // --- The Grid of Icons ---
                Expanded(
                  child: GridView.count(
                    crossAxisCount: 3,
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      SubjectIconButton(
                        iconPath: "assets/images/math_icon.png",
                        subjectName: "Math",
                        onTap: () {
                          SoundManager.playClickSound();
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
              ],
            ),
          ),

          // 3. The Character Image (Bottom Left)
          Align(
            alignment: Alignment.bottomLeft,
            child: Container(
              height: 250, // Adjusted height
              child: Image.asset(
                "assets/images/emma_character_transparent.png",
                fit: BoxFit.contain,
              ),
            ),
          ),

          // 4. The "My Badges" Button (Bottom Right)
          Align(
            alignment: Alignment.bottomRight,
            child: Padding(
              padding: const EdgeInsets.only(right: 24.0, bottom: 24.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 100, // Explicit size for the button
                    height: 100,
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      icon: Image.asset("assets/images/trophy_icon.png"),
                      onPressed: () {
                        SoundManager.playClickSound();
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (context) => const BadgesScreen()),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    "Trophies",
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      shadows: [Shadow(blurRadius: 2, color: Colors.black87)],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}