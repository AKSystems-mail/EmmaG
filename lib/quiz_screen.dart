// Location: lib/quiz_screen.dart

import 'package:flutter/material.dart';

class QuizScreen extends StatefulWidget {
  final List<Map<String, dynamic>> quizData;

  const QuizScreen({super.key, required this.quizData});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  int _currentQuestionIndex = 0;
  int _score = 0;

  void _answerQuestion(String selectedAnswer) {
    final correctAnswer = widget.quizData[_currentQuestionIndex]['correctAnswer'];
    bool isCorrect = selectedAnswer == correctAnswer;

    if (isCorrect) {
      _score++;
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
    final List<String> options = List<String>.from(currentQuestion['options']);

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
                // This creates a list of widgets from our data.
                children: options.map((option) {
                  return Padding(
                    // Add some space between the buttons
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(minimumSize: const Size(250, 50)),
                      onPressed: () => _answerQuestion(option),
                      child: Text(option, style: const TextStyle(fontSize: 20)),
                    ),
                  );
                }).toList(), // .toList() converts the mapped items into a real list of widgets
              ),
            ],
          ),
        ),
      ),
    );
  }
}