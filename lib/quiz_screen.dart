// Location: lib/quiz_screen.dart

import 'package:flutter/material.dart';
import 'sound_manager.dart';
import 'dart:math';

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
    _shuffleOptionsForCurrentQuestion();
  }

  // ADDED: A new function to handle shuffling.
  void _shuffleOptionsForCurrentQuestion() {
    // Get the original options from the widget's data.
    final originalOptions = List<String>.from(widget.quizData[_currentQuestionIndex]['options']);
    // Shuffle the list in place.
    originalOptions.shuffle(Random());
    // Update the state with the newly shuffled list.
    setState(() {
      _shuffledOptions = originalOptions;
    });
  }

  void _answerQuestion(String selectedAnswer) {
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
        title: Text("Question ${_currentQuestionIndex + 1}/${widget.quizData.length}"),
        backgroundColor: Colors.deepPurple.shade400,
        automaticallyImplyLeading: false,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                currentQuestion['question'],
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),

              // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
              // THE DYNAMIC UI UPGRADE:
              // We use a Column and the .map() function to turn our list of
              // strings ('options') into a list of ElevatedButton widgets.
              // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
              Column(
                children: _shuffledOptions.map((option) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(minimumSize: const Size(250, 50)),
                      onPressed: () => _answerQuestion(option),
                      child: Text(option, style: const TextStyle(fontSize: 20)),
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