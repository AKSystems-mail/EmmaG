// Location: lib/main.dart

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:audioplayers/audioplayers.dart';
import 'firebase_options.dart';
import 'subject_screen.dart';
import 'badges_screen.dart';
import 'bonus_level_screen.dart';
import 'sound_manager.dart';

// --- Main Entry Point ---
Future<void> main() async {
  // 1. Ensure Flutter is ready before doing anything else.
  WidgetsFlutterBinding.ensureInitialized();
  
  // 2. Initialize Firebase.
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // 3. Initialize your Sound Manager.
  await SoundManager.initializeTts();

  // 4. Handle user sign-in and data creation BEFORE the app runs.
  await _handleAuthAndSetup();

  // 5. Now that all setup is complete, run the app.
  runApp(const EmmaGAdventuresApp());
}

// --- Startup Helper Functions ---

// This function ensures a user is signed in and has data.
Future<void> _handleAuthAndSetup() async {
  try {
    User? user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      final userCredential = await FirebaseAuth.instance.signInAnonymously();
      user = userCredential.user;
      print("New user signed in anonymously with UID: ${user?.uid}");
      if (user != null) {
        await _createInitialProgressData(user.uid);
      }
    } else {
      print("User already signed in with UID: ${user.uid}");
      // Also check if an existing user is missing data, and fix it.
      await _createInitialProgressData(user.uid);
    }
  } catch (e) {
    print("Error during initial auth setup: $e");
  }
}

// This function creates the starting data for a user ONLY if it doesn't exist.
Future<void> _createInitialProgressData(String userId) async {
  final userDocRef = FirebaseFirestore.instance.collection('users').doc(userId);
  final docSnapshot = await userDocRef.get();
  
  if (docSnapshot.exists) {
    print("User data already exists for $userId. Skipping creation.");
    return;
  }

  print("Creating initial progress data for new user: $userId");
  final subjects = ['math', 'reading', 'science', 'world'];
  final batch = FirebaseFirestore.instance.batch();
  batch.set(userDocRef, {'earnedBadges': []});
  for (var subject in subjects) {
    final progressDocRef = userDocRef.collection('progress').doc(subject);
    batch.set(progressDocRef, {'currentLevel': 1, 'currentTopicIndex': 0});
  }
  await batch.commit();
}


// --- App Root Widget ---
class EmmaGAdventuresApp extends StatelessWidget {
  const EmmaGAdventuresApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Emma G Adventures',
      theme: ThemeData(primarySwatch: Colors.blue, fontFamily: 'Nunito'),
      // The app now starts directly on the MainMenuScreen.
      home: const MainMenuScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}


// --- Reusable Icon Button Widget ---
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


// --- Main Menu Screen Widget ---
class MainMenuScreen extends StatefulWidget {
  const MainMenuScreen({super.key});

  @override
  State<MainMenuScreen> createState() => _MainMenuScreenState();
}

class _MainMenuScreenState extends State<MainMenuScreen> {
  final AudioPlayer _musicPlayer = AudioPlayer();
  bool _isMusicOn = true;

  static const List<double> _grayscaleMatrix = <double>[
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0, 0, 0, 1, 0,
  ];

  @override
  void initState() {
    super.initState();
    _playBackgroundMusic();
  }

  @override
  void dispose() {
    _musicPlayer.stop();
    _musicPlayer.dispose();
    super.dispose();
  }

  void _playBackgroundMusic() async {
    await _musicPlayer.setReleaseMode(ReleaseMode.loop);
    await _musicPlayer.play(AssetSource('audio/main_theme.mp3'));
  }

  void _toggleMusic() {
    setState(() {
      _isMusicOn = !_isMusicOn;
      if (_isMusicOn) {
        _musicPlayer.resume();
      } else {
        _musicPlayer.pause();
      }
    });
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
                Padding(
                  padding: const EdgeInsets.only(top: 40.0),
                  child: SizedBox(
                    height: 150,
                    child: Image.asset("assets/images/EGA_title.png"),
                  ),
                ),
                const Text(
                  'Choose Your Adventure!',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    shadows: [Shadow(blurRadius: 10.0, color: Colors.black54)],
                  ),
                ),
                const SizedBox(height: 20),
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
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder:
                                  (context) =>
                                      const SubjectScreen(subjectName: "Math"),
                            ),
                          );
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/language_arts_icon.png",
                        subjectName: "Reading",
                        onTap: () {
                          SoundManager.playClickSound();
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder:
                                  (context) => const SubjectScreen(
                                    subjectName: "Reading",
                                  ),
                            ),
                          );
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/science_icon.png",
                        subjectName: "Science",
                        onTap: () {
                          SoundManager.playClickSound();
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder:
                                  (context) => const SubjectScreen(
                                    subjectName: "Science",
                                  ),
                            ),
                          );
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/social_studies_icon.png",
                        subjectName: "World",
                        onTap: () {
                          SoundManager.playClickSound();
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder:
                                  (context) =>
                                      const SubjectScreen(subjectName: "World"),
                            ),
                          );
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/bonus_icon.png",
                        subjectName: "Bonus!",
                        onTap: () {
                          SoundManager.playClickSound();
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const BonusLevelScreen(),
                            ),
                          );
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
              height: 250,
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
                    width: 80,
                    height: 80,
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      icon: Image.asset("assets/images/trophy_icon.png"),
                      onPressed: () {
                        SoundManager.playClickSound();
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const BadgesScreen(),
                          ),
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

          // 5. THE CORRECTED MUSIC TOGGLE BUTTON (TOP RIGHT)
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 60,
                      height: 60,
                      child: IconButton(
                        padding: EdgeInsets.zero,
                        onPressed: _toggleMusic,
                        // This is the corrected conditional logic for the icon
                        icon:
                            _isMusicOn
                                ? Image.asset("assets/images/speaker_icon.png")
                                : ColorFiltered(
                                  colorFilter: const ColorFilter.matrix(
                                    _grayscaleMatrix,
                                  ),
                                  child: Image.asset(
                                    "assets/images/speaker_icon.png",
                                  ),
                                ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Music",
                      style: TextStyle(
                        color: _isMusicOn ? Colors.white : Colors.grey.shade400,
                        fontWeight: FontWeight.bold,
                        shadows: const [
                          Shadow(blurRadius: 2, color: Colors.black87),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
