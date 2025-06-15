// Location: lib/bonus_level_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class BonusLevelScreen extends StatefulWidget {
  const BonusLevelScreen({super.key});

  @override
  State<BonusLevelScreen> createState() => _BonusLevelScreenState();
}

class _BonusLevelScreenState extends State<BonusLevelScreen> {
  bool _isLoading = true;
  List<DocumentSnapshot> _challenges = [];
  int _currentChallengeIndex = 0;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchBonusChallenges();
  }

  Future<void> _fetchBonusChallenges() async {
    try {
      final snapshot = await FirebaseFirestore.instance.collection('bonus_level').get();
      if (snapshot.docs.isEmpty) {
        throw Exception("No bonus challenges found.");
      }
      
      // We shuffle the challenges to make it different every time!
      final challenges = snapshot.docs..shuffle();

      setState(() {
        _challenges = challenges;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = "Could not load bonus level.";
        _isLoading = false;
      });
      print("Error fetching bonus challenges: $e");
    }
  }

  // This is a placeholder for the answer checking logic
  void _submitAnswer(String answer) {
    print("User answered: $answer");
    // Move to the next challenge
    if (_currentChallengeIndex < _challenges.length - 1) {
      setState(() {
        _currentChallengeIndex++;
      });
    } else {
      // Quiz is over
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text("Bonus Level Complete!"),
          content: const Text("Great job!"),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text("OK"),
            ),
          ],
        ),
      ).then((_) => Navigator.of(context).pop()); // Go back to main menu
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("STEM Bonus Level"),
        backgroundColor: Colors.indigo,
      ),
      body: _buildContent(),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null) {
      return Center(child: Text(_errorMessage!));
    }

    final challengeData = _challenges[_currentChallengeIndex].data() as Map<String, dynamic>;
    
    // We will build the UI based on the 'challengeType' field.
    // For now, we'll just handle the 'multiple_choice' type.
    return _buildMultipleChoiceChallenge(challengeData);
  }

  Widget _buildMultipleChoiceChallenge(Map<String, dynamic> data) {
    final List<String> options = List<String>.from(data['options'] ?? []);
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              data['promptText'] ?? 'No prompt available.',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 40),
            ...options.map((option) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8.0),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(minimumSize: const Size(250, 50)),
                onPressed: () => _submitAnswer(option),
                child: Text(option, style: const TextStyle(fontSize: 20)),
              ),
            )),
          ],
        ),
      ),
    );
  }
}