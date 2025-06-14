// Location: lib/main.dart

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'subject_screen.dart';
import 'auth_screen.dart'; // Import our new auth screen

// This main() function is correct and initializes Firebase.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const EmmaGAdventuresApp());
}

// This is the root widget of your application.
class EmmaGAdventuresApp extends StatelessWidget {
  const EmmaGAdventuresApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Emma G Adventures',
      theme: ThemeData(primarySwatch: Colors.blue, fontFamily: 'Nunito'),
      // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
      // THE ONLY CHANGE IS HERE: We point the app to the AuthGate.
      // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
      home: const AuthGate(),
      debugShowCheckedModeBanner: false,
    );
  }
}

// ===================================================================
// NO CHANGES ARE NEEDED TO THE WIDGETS BELOW THIS LINE.
// They are here for completeness and are correct as they are.
// ===================================================================

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

class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.4)),
          SafeArea(
            // We replace Center with Align to push the content to the top.
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                // Add some padding to push it down from the very top edge.
                padding: const EdgeInsets.only(top: 80.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min, // Column takes minimum space
                  children: [
                    const Text(
                      'Choose Your Adventure!',
                      style: TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        shadows: [
                          Shadow(blurRadius: 10.0, color: Colors.black54),
                        ],
                      ),
                    ),
                    const SizedBox(height: 60),
                    // The Row of icons is unchanged
                    // AFTER: All four icons are present and functional
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        SubjectIconButton(
                          iconPath: "assets/images/math_icon.png",
                          subjectName: "Math",
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder:
                                    (context) => const SubjectScreen(
                                      subjectName: "Math",
                                    ),
                              ),
                            );
                          },
                        ),
                        SubjectIconButton(
                          iconPath: "assets/images/language_arts_icon.png",
                          subjectName: "Reading",
                          onTap: () {
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
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder:
                                    (context) => const SubjectScreen(
                                      subjectName: "World",
                                    ),
                              ),
                            );
                          },
                        ),
                      ],
                    ),

                    // --- CHANGED: The Character's Position ---
                    // We move her to the bottom-left corner.
                    Align(
                      alignment: Alignment.bottomLeft,
                      child: Container(
                        height: 200, // Adjust size as needed
                        child: Image.asset(
                          "assets/images/emma_character_transparent.png",
                          fit: BoxFit.contain,
                        ),
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
