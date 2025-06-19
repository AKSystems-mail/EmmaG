// Location: lib/quiz_screen.dart

import 'package:flutter/material.dart';
import 'sound_manager.dart';
import 'dart:math';
import 'textured_button.dart';

class QuizScreen extends StatefulWidget {
  final List<Map<String, dynamic>> quizData;

  const QuizScreen({super.key, required this.quizData});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  int _currentQuestionIndex = 0;
  int _score = 0;

  // ADDED: A new state variable to hold the shuffled options.
  List<String> _shuffledOptions = [];

  @override
  void initState() {
    super.initState();
    // When the screen first loads, shuffle the options for the first question.
    _loadAndShuffleOptions();
  }

  // ADDED: Function to load and shuffle options for the current question
  void _loadAndShuffleOptions() {
    final currentQuestionData = widget.quizData[_currentQuestionIndex];
    // Ensure 'options' is not null and is a list before trying to shuffle
    if (currentQuestionData['options'] != null &&
        currentQuestionData['options'] is List) {
      // Create a new list from the original options to avoid modifying the source data
      List<String> options = List<String>.from(currentQuestionData['options']);
      options.shuffle(); // Shuffle the new list
      setState(() {
        _shuffledOptions = options;
      });
    } else {
      // Handle cases where options might be missing or not a list
      setState(() {
        _shuffledOptions = [];
      });
    }
  }

  // ADDED: A new function to handle shuffling.
  void _shuffleOptionsForCurrentQuestion() {
    // Get the original options from the widget's data.
    final originalOptions = List<String>.from(
      widget.quizData[_currentQuestionIndex]['options'],
    );
    // Shuffle the list in place.
    originalOptions.shuffle(Random());
    // Update the state with the newly shuffled list.
    setState(() {
      _shuffledOptions = originalOptions;
    });
  }

  void _answerQuestion(String selectedAnswer) {
    final correctAnswer =
        widget.quizData[_currentQuestionIndex]['correctAnswer'];
    bool isCorrect = selectedAnswer == correctAnswer;

    if (isCorrect) {
      _score++;
      SoundManager.playCorrectSound();
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: Text(isCorrect ? "Correct!" : "Not Quite!"),
          content: Text("The correct answer was: $correctAnswer"),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _nextQuestion();
              },
              child: const Text("Next"),
            ),
          ],
        );
      },
    );
  }

  void _nextQuestion() {
    if (_currentQuestionIndex < widget.quizData.length - 1) {
      setState(() {
        _currentQuestionIndex++;
        _shuffleOptionsForCurrentQuestion();
      });
    } else {
      bool passed = _score > 0;
      Navigator.of(context).pop(passed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentQuestion = widget.quizData[_currentQuestionIndex];
    // Get the list of options from our data.

    return Scaffold(
      appBar: AppBar(
        title: Text(
          "Question ${_currentQuestionIndex + 1}/${widget.quizData.length}",
        ),
        backgroundColor: Colors.blueGrey.shade700,
        automaticallyImplyLeading: false,
      ),
      body: Stack(
        // Assuming you want a background here too
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage(
                  "assets/images/quiz_screen_background.png",
                ), // Your background
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.5)),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      currentQuestion['question'],
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 40),
                    Column(
                      // CHANGED: Use _shuffledOptions to build buttons
                      children:
                          _shuffledOptions.map((option) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(
                                vertical: 8.0,
                              ),
                              child: TexturedButton(
                                // Using TexturedButton
                                text: option,
                                onPressed: () => _answerQuestion(option),
                                texture: ButtonTexture.stone,
                                fontSize: 18,
                                 fixedSize: const Size(280, 70),
                                 padding: const EdgeInsets.symmetric(vertical: 8.0),
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
