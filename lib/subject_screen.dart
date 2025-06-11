// Location: lib/subject_screen.dart

import 'package:flutter/material.dart';

class SubjectScreen extends StatelessWidget {
  // This screen needs to know which subject was tapped.
  final String subjectName;

  // We add the subjectName to the constructor.
  const SubjectScreen({super.key, required this.subjectName});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // The AppBar is the top bar of the screen.
      appBar: AppBar(
        // It will automatically show a back button to return to the main menu.
        title: Text(subjectName), // Display the subject name in the title.
        backgroundColor: Colors.brown.shade400, // A color that fits the theme
      ),
      body: Center(
        child: Text(
          'Lessons for $subjectName will go here!',
          style: const TextStyle(fontSize: 22),
        ),
      ),
    );
  }
}
