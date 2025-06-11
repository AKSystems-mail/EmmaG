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
        fontFamily: 'Nunito',
      ),
      home: const MainMenuScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// NEW WIDGET: A reusable button for our subject icons.
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
class SubjectIconButton extends StatelessWidget {
  final String iconPath;
  final String subjectName;
  final VoidCallback onTap; // A function to call when the button is tapped

  const SubjectIconButton({
    super.key,
    required this.iconPath,
    required this.subjectName,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // GestureDetector detects taps on its child widget.
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min, // Ensures the column doesn't stretch vertically
        children: [
          Image.asset(
            iconPath,
            width: 90, // Set a consistent size for the icon images
            height: 90,
          ),
          const SizedBox(height: 8), // Adds a little space between the icon and text
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
          // 1. The Background Image (No changes here)
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),

          // 2. The Main Content
          SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
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
                  const SizedBox(height: 60), // Increased space before icons

                  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
                  // UPDATED SECTION: Replaced the placeholder with a Row of our new buttons.
                  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly, // This spreads the icons out evenly
                    children: [
                      SubjectIconButton(
                        iconPath: "assets/images/math_icon.png",
                        subjectName: "Math",
                        onTap: () {
                          // For now, we just print to the console to test it.
                          print("Tapped on Math!");
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/language_arts_icon.png",
                        subjectName: "Reading",
                        onTap: () {
                          print("Tapped on Reading!");
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/science_icon.png",
                        subjectName: "Science",
                        onTap: () {
                          print("Tapped on Science!");
                        },
                      ),
                      SubjectIconButton(
                        iconPath: "assets/images/social_studies_icon.png",
                        subjectName: "Social Studies",
                        onTap: () {
                          print("Tapped on World!");
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // 3. The Character Image (No changes here)
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              height: 250,
              child: Image.asset(
                "assets/images/emma_character.png",
                fit: BoxFit.contain,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
