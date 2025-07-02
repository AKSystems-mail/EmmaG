// Location: lib/quiz_screen.dart

import 'package:flutter/material.dart';
import 'sound_manager.dart';
import 'textured_button.dart';
import 'sound_back_button.dart';

class QuizScreen extends StatefulWidget {
  final List<Map<String, dynamic>> quizData;
  const QuizScreen({super.key, required this.quizData});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  int _currentQuestionIndex = 0;
  int _score = 0;
  List<String> _shuffledOptions = [];

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
    SoundManager.playClickSound(); // Play click sound for consistency
    final correctAnswer = widget.quizData[_currentQuestionIndex]['correctAnswer'];
    bool isCorrect = selectedAnswer == correctAnswer;

    if (isCorrect) {
      _score++;
      SoundManager.playCorrectSound();
    }

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
                Text(isCorrect ? "Correct!" : "Not Quite!", style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF5D4037))),
                const SizedBox(height: 16),
                Text("The correct answer was: $correctAnswer", style: const TextStyle(fontSize: 18, color: Color(0xFF5D4037))),
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

    return Scaffold(
      appBar: AppBar(
        leading: const SoundBackButton(color: Colors.white),
        title: Text(
          "Question ${_currentQuestionIndex + 1}/${widget.quizData.length}",
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.blueGrey.shade700,
      ),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(image: DecorationImage(image: AssetImage("assets/images/quiz_screen_background.png"), fit: BoxFit.cover)),
          ),
          Container(color: Colors.black.withOpacity(0.5)),
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
                    Column(
                      children: _shuffledOptions.map((option) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8.0),
                          child: TexturedButton(
                            text: option,
                            onPressed: () => _answerQuestion(option),
                            texture: ButtonTexture.stone,
                            fontSize: 18,
                            fixedSize: const Size(280, 70),
                            textStyle: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              shadows: [Shadow(blurRadius: 2.0, color: Colors.black87, offset: Offset(1, 1))]
                            ),
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