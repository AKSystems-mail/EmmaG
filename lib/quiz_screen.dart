// Location: lib/quiz_screen.dart

import 'package:flutter/material.dart';
import 'sound_manager.dart';
import 'textured_button.dart';
import 'sound_back_button.dart';

class QuizScreen extends StatefulWidget {
  final List<Map<String, dynamic>> quizData;
  final String topicName;
  final int currentLevel;
  final int totalLevelsInTopic;

  const QuizScreen({
    super.key,
    required this.quizData,
    required this.topicName,
    required this.currentLevel,
    required this.totalLevelsInTopic,
  });

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  int _currentQuestionIndex = 0;
  int _score = 0;
  List<String> _shuffledOptions = [];
    int _lives = 3;

  @override
  void initState() {
    super.initState();
    _loadAndShuffleOptions();
  }

  void _loadAndShuffleOptions() {
    if (widget.quizData.isEmpty || _currentQuestionIndex >= widget.quizData.length) return;
    final currentQuestionData = widget.quizData[_currentQuestionIndex];
    if (currentQuestionData['options'] != null && currentQuestionData['options'] is List) {
      List<String> options = List<String>.from(currentQuestionData['options']);
      options.shuffle();
      setState(() {
        _shuffledOptions = options;
      });
    } else {
      setState(() {
        _shuffledOptions = [];
      });
    }
  }

  void _answerQuestion(String selectedAnswer) {
    SoundManager.playClickSound();
    final correctAnswer = widget.quizData[_currentQuestionIndex]['correctAnswer'];
    bool isCorrect = selectedAnswer == correctAnswer;

    if (isCorrect) {
      _score++;
      SoundManager.playCorrectSound();
      _showResultDialog(true, correctAnswer);
    } else {
      SoundManager.playWrongSound();
      // If incorrect, lose a life.
      setState(() {
        _lives--;
      });

      // Check for game over *after* losing a life.
      if (_lives <= 0) {
        _showGameOverDialog();
      } else {
        // If the game is not over, show the "Try Again" dialog.
        _showTryAgainDialog();
      }
    }
  }

  // This dialog is for CORRECT answers.
  void _showResultDialog(bool isCorrect, String correctAnswer) {
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
                Text("Correct!", style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5D4037))),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                    Future.delayed(const Duration(milliseconds: 400), () => _nextQuestion());
                  },
                  child: const Text("Next", style: TextStyle(fontSize: 18)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // +++ NEW: This dialog is for INCORRECT answers when the user still has lives. +++
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
                  child: const Text("Try Again", style: TextStyle(fontSize: 18)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // +++ UPDATED: The game over dialog now has your custom message. +++
  void _showGameOverDialog() {
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
                const Text("Let's Review!", style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5D4037))),
                const SizedBox(height: 16),
                const Text(
                  "It's okay! Let's go back to the lesson. Don't forget to Ask For Help if you're stuck!",
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, color: Color(0xFF5D4037)),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop(); // Close this dialog
                    Navigator.of(context).pop(false); // Pop the quiz screen with a "fail" result
                  },
                  child: const Text("Review Lesson", style: TextStyle(fontSize: 18)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _nextQuestion() {
    if (_currentQuestionIndex < widget.quizData.length - 1) {
      setState(() {
        _currentQuestionIndex++;
        _loadAndShuffleOptions();
      });
    } else {
      bool passed = _score > 0;
      Navigator.of(context).pop(passed);
    }
  }

  @override
  void dispose() {
    // Stop any speech when the screen is disposed
    SoundManager.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.quizData.isEmpty || _currentQuestionIndex >= widget.quizData.length) {
      return Scaffold(
        appBar: AppBar(title: const Text("Quiz"), leading: const SoundBackButton()),
        body: const Center(child: Text("No questions available or quiz finished.")),
      );
    }
    final currentQuestion = widget.quizData[_currentQuestionIndex];
    final questionText = currentQuestion['question'] as String? ?? "No question text.";

    // +++ ADDED: Calculate progress towards the trophy +++
    final double trophyProgress = (widget.currentLevel - 1) / widget.totalLevelsInTopic;

    return Scaffold(
      appBar: AppBar(
        leading: const SoundBackButton(color: Colors.white),
        // +++ UPDATED: Use the topicName for a cleaner title +++
        title: Text(
          widget.topicName,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.blueGrey.shade700,
        // +++ ADDED: The trophy progress bar +++
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(10.0),
          child: LinearProgressIndicator(
            value: trophyProgress,
            backgroundColor: Colors.white.withOpacity(0.3),
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.amber),
          ),
        ),
      ),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(image: DecorationImage(image: AssetImage("assets/images/quiz_screen_background.png"), fit: BoxFit.cover)),
          ),
          Container(color: Colors.black.withOpacity(0.5)),
                    // +++ ADDED: The Heart Display +++
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
                      color: Colors.red.shade400,
                      size: 30,
                      shadows: const [Shadow(blurRadius: 2, color: Colors.black54)],
                    );
                  }),
                ),
              ),
            ),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
                    // THE FIX: The Row containing the question and speaker icon
                    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            questionText,
                            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white, shadows: [Shadow(blurRadius: 2, color: Colors.black87)]),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        IconButton(
                          icon: Image.asset("assets/images/speaker_icon.png"),
                          iconSize: 36,
                          onPressed: () {
                            SoundManager.speak(questionText);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 40),
GridView.count(
  crossAxisCount: 2, // This creates the two columns
  shrinkWrap: true, // Important: tells the GridView to be only as tall as its content
  physics: const NeverScrollableScrollPhysics(), // Disables scrolling within the grid
  mainAxisSpacing: 16.0, // Vertical space between buttons
  crossAxisSpacing: 16.0, // Horizontal space between buttons
  childAspectRatio: 2.5, // Adjust this to control the button height (width / height)
  children: _shuffledOptions.map((option) {
    // We no longer need the Padding widget here
    return TexturedButton(
      text: option,
      onPressed: () => _answerQuestion(option),
      texture: ButtonTexture.stone,
      fontSize: 18,
      // We remove fixedSize to let the grid control the button size
      textStyle: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.bold,
        shadows: [Shadow(blurRadius: 2.0, color: Colors.black87, offset: Offset(1, 1))]
      ),
    );
  }).toList(),
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