// Location: lib/bonus_level_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'sound_manager.dart';
import 'textured_button.dart';
import 'sound_back_button.dart';

// BonusChallenge Data Class (This is correct and does not need changes)
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
  // --- STATE VARIABLES ---
  bool _isLoading = true;
  List<BonusChallenge> _challenges = [];
  int _currentChallengeIndex = 0;
  String? _errorMessage;
  int _bonusScore = 0;
  int _lives = 3;
  bool _canPlayToday = false;

  // Helper to generate a unique ID for bonus challenges for caching
  String _getChallengeId(String challengeId) {
    return "bonus_$challengeId";
  }

  // --- LIFECYCLE METHODS ---
  @override
  void initState() {
    super.initState();
    _handleBonusLevelEntry();
  }

  @override
  void dispose() {
    SoundManager.stop();
    super.dispose();
  }

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // THE "DAILY CHALLENGE" LOGIC
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Future<void> _handleBonusLevelEntry() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      setState(() {
        _errorMessage = "You must be logged in to play.";
        _isLoading = false;
      });
      return;
    }

    final bonusStateRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('bonusProgress')
        .doc('dailyChallenge');
    final bonusStateDoc = await bonusStateRef.get();

    if (bonusStateDoc.exists) {
      final data = bonusStateDoc.data()!;
      final lastAttempt = (data['lastAttemptTimestamp'] as Timestamp).toDate();
      final now = DateTime.now();

      // Check if it's a new day in the user's local time
      if (now.year > lastAttempt.year ||
          now.month > lastAttempt.month ||
          now.day > lastAttempt.day) {
        // Reset for a new day
        await bonusStateRef.set({
          'heartsRemaining': 3,
          'lastAttemptTimestamp': Timestamp.now(),
          'currentChallengeIndex': 0,
        });
        setState(() {
          _lives = 3;
          _currentChallengeIndex = 0;
          _canPlayToday = true;
        });
      } else {
        // Same day, continue progress
        final hearts = data['heartsRemaining'] as int;
        if (hearts > 0) {
          setState(() {
            _lives = hearts;
            _currentChallengeIndex = data['currentChallengeIndex'] ?? 0;
            _canPlayToday = true;
          });
        } else {
          // No hearts left for today
          setState(() {
            _canPlayToday = false;
            _isLoading = false;
          });
        }
      }
    } else {
      // First time playing
      await bonusStateRef.set({
        'heartsRemaining': 3,
        'lastAttemptTimestamp': Timestamp.now(),
        'currentChallengeIndex': 0,
      });
      setState(() {
        _lives = 3;
        _currentChallengeIndex = 0;
        _canPlayToday = true;
      });
    }

    if (_canPlayToday) {
      _fetchBonusChallenges();
    }
  }

  Future<void> _fetchBonusChallenges() async {
    try {
      final snapshot =
          await FirebaseFirestore.instance.collection('bonus_level').orderBy('difficultyScore').get();
      if (snapshot.docs.isEmpty) {
        throw Exception("No bonus challenges found.");
      }
      final challenges =
          snapshot.docs.map((doc) => BonusChallenge.fromSnapshot(doc)).toList();
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

  Future<void> _updateProgressInFirestore({int? newLives, int? newIndex}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final bonusStateRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('bonusProgress')
        .doc('dailyChallenge');

    final Map<String, dynamic> updateData = {};
    if (newLives != null) {
      updateData['heartsRemaining'] = newLives;
    }
    if (newIndex != null) {
      updateData['currentChallengeIndex'] = newIndex;
    }

    if (updateData.isNotEmpty) {
      // Use update instead of set with merge to avoid creating a new doc if it's deleted mid-game
      await bonusStateRef.update(updateData);
    }
  }

  // --- DIALOGS ---

  void _showCorrectAnswerDialog(String correctAnswer, String? explanation) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.all(24.0),
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/parchment_background.png"),
                fit: BoxFit.fill,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text("Awesome!", style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5D4037))),
                const SizedBox(height: 16),
                Text("The answer was: $correctAnswer", style: const TextStyle(fontSize: 18, color: Color(0xFF5D4037))),
                if (explanation != null && explanation.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text("Here's why: $explanation", style: const TextStyle(fontSize: 16, color: Color(0xFF5D4037))),
                ],
                const SizedBox(height: 24),
                TexturedButton(
                  text: "Next",
                  onPressed: () {
                    Navigator.of(context).pop();
                    // A small delay feels better than an instant transition
                    Future.delayed(const Duration(milliseconds: 300), () => _nextChallenge());
                  },
                  texture: ButtonTexture.stone,
                  fontSize: 18,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showTryAgainDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.all(24.0),
            decoration: const BoxDecoration(image: DecorationImage(image: AssetImage("assets/images/parchment_background.png"), fit: BoxFit.fill)),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text("Not Quite!", style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5D4037))),
                const SizedBox(height: 16),
                const Text("Take another look and try again!", textAlign: TextAlign.center, style: TextStyle(fontSize: 18, color: Color(0xFF5D4037))),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop(); // Just close the dialog.
                  },
                  child: const Text("Try Again", style: TextStyle(fontSize: 18, color: Color(0xFF5D4037))),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showGameOverDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.all(24.0),
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/parchment_background.png"),
                fit: BoxFit.fill,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  "Out of Hearts!",
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5D4037)),
                ),
                const SizedBox(height: 16),
                const Text(
                  "Great effort! Come back tomorrow for a new set of challenges.",
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, color: Color(0xFF5D4037)),
                ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop(); // Close dialog
                    Navigator.of(context).pop(); // Go back to previous screen
                  },
                  child: const Text(
                    "OK",
                    style: TextStyle(fontSize: 18, color: Color(0xFF5D4037)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // --- CORE GAME LOGIC ---

  // +++ FIXED: This function is now corrected and handles all logic properly +++
  void _submitAnswer(String selectedAnswer) {
    SoundManager.playClickSound();
    final currentChallenge = _challenges[_currentChallengeIndex];
    bool isCorrect = selectedAnswer == currentChallenge.correctAnswer;

    if (isCorrect) {
      setState(() {
        _bonusScore++;
      });
      SoundManager.playCorrectSound();
      // Show the explanation dialog, which will then call _nextChallenge
      _showCorrectAnswerDialog(
        currentChallenge.correctAnswer,
        currentChallenge.explanationText,
      );
    } else {
      SoundManager.playWrongSound(); // Assumes this method exists
      final newLives = _lives - 1;

      // FIX: Update the local state so the UI (hearts) reflects the change immediately
      setState(() {
        _lives = newLives;
      });

      // Update progress in Firestore
      _updateProgressInFirestore(newLives: newLives);

      if (newLives <= 0) {
        // No more lives, game over for today
        _showGameOverDialog();
      } else {
        // Lives remaining, prompt to try the same question again
        _showTryAgainDialog();
      }
    }
    // The misplaced, syntactically incorrect code block that was here has been removed.
  }

  void _nextChallenge() {
    if (_currentChallengeIndex < _challenges.length - 1) {
      final newIndex = _currentChallengeIndex + 1;
      setState(() {
        _currentChallengeIndex = newIndex;
      });
      _updateProgressInFirestore(newIndex: newIndex);
    } else {
      // Completed all challenges
      // Optionally, you could update Firestore to mark the day as "completed"
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) => BonusResultsScreen(
            score: _bonusScore,
            totalQuestions: _challenges.length,
          ),
        ),
      );
    }
  }

  // --- UI BUILD METHODS ---

  @override
  Widget build(BuildContext context) {
    final double progress =
        _challenges.isNotEmpty ? ((_currentChallengeIndex) / _challenges.length) : 0.0;

    return Scaffold(
      appBar: AppBar(
        leading: const SoundBackButton(color: Colors.white),
        title: const Text("Daily Bonus Challenge"),
        backgroundColor: Colors.indigo.shade700,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(10.0),
          child: LinearProgressIndicator(
            value: progress,
            backgroundColor: Colors.white.withOpacity(0.3),
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.lightGreenAccent),
          ),
        ),
      ),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/bonus_level_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.4)),
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(3, (index) {
                    return Icon(
                      index < _lives ? Icons.favorite : Icons.favorite_border,
                      color: Colors.pink.shade300,
                      size: 30,
                      shadows: const [Shadow(blurRadius: 2, color: Colors.black54)],
                    );
                  }),
                ),
              ),
            ),
          ),
          _buildContent(),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (!_canPlayToday) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: Text(
            "You've used all your hearts for today. Come back tomorrow for a new challenge!",
            style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    if (_errorMessage != null) {
      return Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.white, fontSize: 18)));
    }
    if (_challenges.isEmpty) {
      return const Center(child: Text("No challenges available.", style: TextStyle(color: Colors.white, fontSize: 18)));
    }

    final currentChallenge = _challenges[_currentChallengeIndex];
    return _buildMultipleChoiceChallengeUI(currentChallenge);
  }

  Widget _buildMultipleChoiceChallengeUI(BonusChallenge challenge) {
    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                "Challenge ${_currentChallengeIndex + 1}/${_challenges.length}",
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.white.withOpacity(0.8),
                  shadows: const [Shadow(blurRadius: 1, color: Colors.black)],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                "Subjects: ${challenge.subjectsInvolved.join(' & ')}",
                style: TextStyle(
                  fontSize: 16,
                  fontStyle: FontStyle.italic,
                  color: Colors.white.withOpacity(0.9),
                  shadows: const [Shadow(blurRadius: 1, color: Colors.black)],
                ),
              ),
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        challenge.promptText,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          shadows: [Shadow(blurRadius: 2, color: Colors.black87)],
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    IconButton(
                      icon: Image.asset("assets/images/speaker_icon.png"),
                      iconSize: 36,
                      onPressed: () {
                        SoundManager.speak(challenge.promptText, _getChallengeId(challenge.id)); // Updated call
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 16.0,
                crossAxisSpacing: 16.0,
                childAspectRatio: 2.5,
                children: challenge.options.map((option) {
                  return TexturedButton(
                    text: option,
                    onPressed: () => _submitAnswer(option),
                    texture: ButtonTexture.stone,
                    textStyle: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      shadows: [Shadow(blurRadius: 2, color: Colors.black87)],
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// BonusResultsScreen does not need changes, but is included for completeness.
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
        leading: const SoundBackButton(color: Colors.white),
        title: const Text("Bonus Level Results!"),
        backgroundColor: Colors.amber.shade800,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                "Great Effort!",
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: Colors.amber.shade900,
                ),
              ),
              const SizedBox(height: 30),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.orange.shade100,
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(color: Colors.orange.shade300, width: 2),
                ),
                child: Text(
                  "You answered\n$score out of $totalQuestions\nquestions correctly!",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    color: Colors.orange.shade800,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                "${percentage.toStringAsFixed(0)}% Correct",
                style: TextStyle(
                  fontSize: 20,
                  color: Colors.grey.shade700,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 40),
              TexturedButton(
                text: "Back to Menu",
                onPressed: () {
                  Navigator.of(context).pop();
                },
                texture: ButtonTexture.wood,
                fontSize: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
