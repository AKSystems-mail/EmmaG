// Location: lib/main.dart

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// import 'package:audioplayers/audioplayers.dart' as audioplayers;
import 'firebase_options.dart';
import 'subject_screen.dart';
import 'badges_screen.dart';
import 'bonus_level_screen.dart';
import 'sound_manager.dart';

// --- Main Entry Point ---
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await SoundManager.initializeTts();
  await _handleAuthAndSetup();
  runApp(const EmmaGAdventuresApp());
}

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
    final screenWidth = MediaQuery.of(context).size.width;
    // +++ THE FIX: This is now the master control for the icon's size +++
    final double iconContainerSize = (screenWidth * 0.22).clamp(80.0, 120.0);
    final responsiveFontSize = (screenWidth * 0.035).clamp(14.0, 20.0);

    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        // The overall widget takes up this much space
        width: iconContainerSize,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: iconContainerSize * 0.8, // Image takes 80% of the container
              height: iconContainerSize * 0.8,
              child: Image.asset(iconPath, fit: BoxFit.contain),
            ),
            const SizedBox(height: 8),
            Text(
              subjectName,
              style: TextStyle(
                color: Colors.white,
                fontSize: responsiveFontSize,
                fontWeight: FontWeight.bold,
                shadows: const [Shadow(blurRadius: 5.0, color: Colors.black87)],
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
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
  bool _userHasInteracted = false;

  static const List<double> _grayscaleMatrix = <double>[
    0.2126,
    0.7152,
    0.0722,
    0,
    0,
    0.2126,
    0.7152,
    0.0722,
    0,
    0,
    0.2126,
    0.7152,
    0.0722,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];


  @override
  void initState() {
    super.initState();
  }

  void _toggleMusic() {
    setState(() {
      if (!_userHasInteracted) {
        _userHasInteracted = true;
        SoundManager.playBackgroundMusic();
      } else {
        SoundManager.toggleMusic();
      }
    });
  }

// In lib/main.dart, inside the _MainMenuScreenState class

@override
Widget build(BuildContext context) {
  final screenHeight = MediaQuery.of(context).size.height;
  final screenWidth = MediaQuery.of(context).size.width;
  final buttonLabelFontSize = (screenWidth * 0.03).clamp(12.0, 18.0);

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
                  height: screenHeight * 0.15,
                  child: Image.asset("assets/images/EGA_title.png"),
                ),
              ),
              Text(
                'Choose Your Adventure!',
                style: TextStyle(
                  fontSize: (screenWidth * 0.05).clamp(20.0, 32.0),
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  shadows: const [Shadow(blurRadius: 10.0, color: Colors.black54)],
                ),
              ),
              // +++ THE FIX: This SizedBox controls the gap you wanted to adjust +++
              SizedBox(height: screenHeight * 0.03), // Use a smaller percentage for a smaller gap

              Wrap(
                spacing: 16.0,
                runSpacing: 16.0,
                alignment: WrapAlignment.start,
                children: [
                  SubjectIconButton(
                    iconPath: "assets/images/math_icon.png",
                    subjectName: "Math",
                    onTap: () { SoundManager.playClickSound(); Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Math"))); },
                  ),
                  SubjectIconButton(
                    iconPath: "assets/images/language_arts_icon.png",
                    subjectName: "Reading",
                    onTap: () { SoundManager.playClickSound(); Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Reading"))); },
                  ),
                  SubjectIconButton(
                    iconPath: "assets/images/science_icon.png",
                    subjectName: "Science",
                    onTap: () { SoundManager.playClickSound(); Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "Science"))); },
                  ),
                  SubjectIconButton(
                    iconPath: "assets/images/social_studies_icon.png",
                    subjectName: "World",
                    onTap: () { SoundManager.playClickSound(); Navigator.push(context, MaterialPageRoute(builder: (context) => const SubjectScreen(subjectName: "World"))); },
                  ),
                  SubjectIconButton(
                    iconPath: "assets/images/bonus_icon.png",
                    subjectName: "Bonus!",
                    onTap: () { SoundManager.playClickSound(); Navigator.push(context, MaterialPageRoute(builder: (context) => const BonusLevelScreen())); },
                  ),
                ],
              ),
            ],
          ),
        ),

        // 3. The Character Image (Bottom Left)
        Align(
          alignment: Alignment.bottomLeft,
          child: Container(
            height: screenHeight * 0.3,
            child: Image.asset("assets/images/emma_character_transparent.png", fit: BoxFit.contain),
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
                  width: (screenWidth * 0.15).clamp(60.0, 100.0),
                  height: (screenWidth * 0.15).clamp(60.0, 100.0),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: Image.asset("assets/images/trophy_icon.png"),
                    onPressed: () { SoundManager.playClickSound(); Navigator.push(context, MaterialPageRoute(builder: (context) => const BadgesScreen())); },
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Trophies",
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                      fontSize: buttonLabelFontSize,
                      shadows: const [Shadow(blurRadius: 2, color: Colors.black87)],
                  ),
                ),
              ],
            ),
          ),
        ),

        // 5. THE MUSIC TOGGLE BUTTON (TOP RIGHT)
        SafeArea(
          child: Align(
            alignment: Alignment.topRight,
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: (screenWidth * 0.1).clamp(40.0, 70.0),
                    height: (screenWidth * 0.1).clamp(40.0, 70.0),
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      onPressed: _toggleMusic,
                      icon: SoundManager.isMusicOn
                          ? Image.asset("assets/images/speaker_icon.png")
                          : ColorFiltered(
                              colorFilter: const ColorFilter.matrix(_grayscaleMatrix),
                              child: Image.asset("assets/images/speaker_icon.png"),
                            ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Music",
                    style: TextStyle(
                      color: SoundManager.isMusicOn ? Colors.white : Colors.grey.shade400,
                      fontWeight: FontWeight.bold,
                      fontSize: (screenWidth * 0.03).clamp(12.0, 18.0),
                      shadows: const [Shadow(blurRadius: 2, color: Colors.black87)],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

      ],
    ));
  }
}