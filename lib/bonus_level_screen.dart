// Location: lib/bonus_level_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'sound_manager.dart'; // Make sure you have this import

// BonusChallenge Data Class (This is correct from your file)
class BonusChallenge {
  final String id;
  final int difficultyScore;
  final List<String> subjectsInvolved;
  final String promptText;
  final String challengeType;
  final List<String> options;
  final String correctAnswer;
  final String? explanationText;

  BonusChallenge({
    required this.id,
    required this.difficultyScore,
    required this.subjectsInvolved,
    required this.promptText,
    required this.challengeType,
    required this.options,
    required this.correctAnswer,
    this.explanationText,
  });

  factory BonusChallenge.fromSnapshot(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return BonusChallenge(
      id: doc.id,
      difficultyScore: data['difficultyScore'] ?? 0,
      subjectsInvolved: List<String>.from(data['subjectsInvolved'] ?? []),
      promptText: data['promptText'] ?? 'No prompt available.',
      challengeType: data['challengeType'] ?? 'multiple_choice',
      options: List<String>.from(data['options'] ?? []),
      correctAnswer: data['correctAnswer'] ?? '',
      explanationText: data['explanationText'],
    );
  }
}

class BonusLevelScreen extends StatefulWidget {
  const BonusLevelScreen({super.key});

  @override
  State<BonusLevelScreen> createState() => _BonusLevelScreenState();
}

class _BonusLevelScreenState extends State<BonusLevelScreen> {
  bool _isLoading = true;
  List<BonusChallenge> _challenges = [];
  int _currentChallengeIndex = 0;
  String? _errorMessage;
  int _bonusScore = 0;

  @override
  void initState() {
    super.initState();
    _fetchBonusChallenges();
  }

  Future<void> _fetchBonusChallenges() async {
    // This function is correct from your file and does not need changes.
    // It fetches, orders (or shuffles), and stores the challenges.
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('bonus_level')
          .orderBy('difficultyScore')
          .get();
      if (snapshot.docs.isEmpty) {
        throw Exception("No bonus challenges found.");
      }
      final challenges = snapshot.docs.map((doc) => BonusChallenge.fromSnapshot(doc)).toList();
      setState(() {
        _challenges = challenges;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = "Could not load bonus level: ${e.toString()}";
        _isLoading = false;
      });
      print("Error fetching bonus challenges: $e");
    }
  }

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // UPDATED: _submitAnswer function with sound and delay
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  void _submitAnswer(String selectedAnswer) {
    SoundManager.playClickSound(); // Play click sound on any answer

    final currentChallenge = _challenges[_currentChallengeIndex];
    bool isCorrect = selectedAnswer == currentChallenge.correctAnswer;

    if (isCorrect) {
      _bonusScore++;
      SoundManager.playCorrectSound(); // Play correct sound if right
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: Text(isCorrect ? "Awesome!" : "Not Quite!"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("The correct answer was: ${currentChallenge.correctAnswer}"),
              if (currentChallenge.explanationText != null && currentChallenge.explanationText!.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text("Here's why: ${currentChallenge.explanationText}"),
              ]
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop(); // Close dialog
                // Add delay before moving to next question
                Future.delayed(const Duration(milliseconds: 500), () {
                  _nextChallenge();
                });
              },
              child: const Text("Next"),
            ),
          ],
        );
      },
    );
  }

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // UPDATED: _nextChallenge function to navigate to Results Screen
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  void _nextChallenge() {
    if (_currentChallengeIndex < _challenges.length - 1) {
      setState(() {
        _currentChallengeIndex++;
      });
    } else {
      // Bonus level is over, navigate to the Results Screen
      Navigator.of(context).pop(); // Pop the BonusLevelScreen itself
      Navigator.pushReplacement( // Use pushReplacement so back button doesn't return to quiz
        context,
        MaterialPageRoute(
          builder: (context) => BonusResultsScreen(
            score: _bonusScore,
            totalQuestions: _challenges.length,
          ),
        ),
      );
    }
  }

  // build and _buildContent methods are correct from your file
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("STEM Bonus Challenge"),
        backgroundColor: Colors.indigo.shade700,
      ),
      body: _buildContent(),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Text(_errorMessage!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red, fontSize: 18)),
      ));
    }
    if (_challenges.isEmpty) {
         return const Center(child: Text("No challenges available."));
    }
    final currentChallenge = _challenges[_currentChallengeIndex];
    return _buildMultipleChoiceChallengeUI(currentChallenge);
  }

  Widget _buildMultipleChoiceChallengeUI(BonusChallenge challenge) {
    // This UI building function is correct from your file
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: SingleChildScrollView(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text("Challenge ${challenge.difficultyScore}/${_challenges.length}", style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
              const SizedBox(height: 8),
              Text("Subjects: ${challenge.subjectsInvolved.join(' & ')}", style: TextStyle(fontSize: 16, fontStyle: FontStyle.italic, color: Colors.grey.shade700)),
              const SizedBox(height: 20),
              Text(challenge.promptText, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
              const SizedBox(height: 40),
              ...challenge.options.map((option) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 8.0),
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(minimumSize: const Size(280, 50)),
                  onPressed: () => _submitAnswer(option), // Pass the option to _submitAnswer
                  child: Text(option, style: const TextStyle(fontSize: 18)),
                ),
              )),
            ],
          ),
        ),
      ),
    );
  }
}


// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// NEW WIDGET: The Bonus Results Screen (Added at the end of the file)
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
class BonusResultsScreen extends StatelessWidget {
  final int score;
  final int totalQuestions;

  const BonusResultsScreen({
    super.key,
    required this.score,
    required this.totalQuestions,
  });

  @override
  Widget build(BuildContext context) {
    double percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Bonus Level Results!"),
        backgroundColor: Colors.amber.shade800,
        automaticallyImplyLeading: false,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                "Great Effort!",
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.amber.shade900),
              ),
              const SizedBox(height: 30),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.orange.shade100,
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(color: Colors.orange.shade300, width: 2)
                ),
                child: Text(
                  "You answered\n$score out of $totalQuestions\nquestions correctly!",
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 24, color: Colors.orange.shade800, fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(height: 10),
               Text(
                "${percentage.toStringAsFixed(0)}% Correct",
                style: TextStyle(fontSize: 20, color: Colors.grey.shade700, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 40),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 15),
                  textStyle: const TextStyle(fontSize: 20),
                ),
                onPressed: () {
                  SoundManager.playClickSound();
                  Navigator.of(context).pop(); // Go back to Main Menu
                },
                child: const Text("Back to Menu"),
              )
            ],
          ),
        ),
      ),
    );
  }
}