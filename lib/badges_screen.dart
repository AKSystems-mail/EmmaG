// Location: lib/badges_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

// A simple data class to hold the details for a badge.
class Badge {
  final String name;
  final String imageUrl;

  Badge({required this.name, required this.imageUrl});
}

class BadgesScreen extends StatefulWidget {
  const BadgesScreen({super.key});

  @override
  State<BadgesScreen> createState() => _BadgesScreenState();
}

class _BadgesScreenState extends State<BadgesScreen> {
  bool _isLoading = true;
  List<Badge> _earnedBadges = [];
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchEarnedBadges();
  }

  Future<void> _fetchEarnedBadges() async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw Exception("No user logged in.");

      // 1. Get the list of badge IDs the user has earned.
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final List<String> badgeIds = List<String>.from(userDoc.data()?['earnedBadges'] ?? []);

      if (badgeIds.isEmpty) {
        // If the user has no badges, we can stop here.
        setState(() {
          _isLoading = false;
        });
        return;
      }

      List<Badge> badges = [];
      // 2. For each badge ID, fetch its details from the main 'badges' collection.
      for (String badgeId in badgeIds) {
        final badgeDoc = await FirebaseFirestore.instance.collection('badges').doc(badgeId).get();
        if (badgeDoc.exists) {
          badges.add(Badge(
            name: badgeDoc.data()?['name'] ?? 'Unnamed Badge',
            imageUrl: badgeDoc.data()?['imageUrl'] ?? '',
          ));
        }
      }

      // 3. Update the UI with the list of fetched badges.
      setState(() {
        _earnedBadges = badges;
        _isLoading = false;
      });

    } catch (e) {
      setState(() {
        _errorMessage = "Could not load badges.";
        _isLoading = false;
      });
      print("Error fetching badges: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("My Badges"),
        backgroundColor: Colors.amber.shade700,
      ),
      body: _buildContent(),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null) {
      return Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)));
    }
    if (_earnedBadges.isEmpty) {
      return const Center(
        child: Text(
          "No badges earned yet. Keep learning!",
          style: TextStyle(fontSize: 18, color: Colors.grey),
        ),
      );
    }

    // Use a GridView to display the badges nicely.
    return GridView.builder(
      padding: const EdgeInsets.all(16.0),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3, // 3 badges per row
        crossAxisSpacing: 16.0,
        mainAxisSpacing: 16.0,
      ),
      itemCount: _earnedBadges.length,
      itemBuilder: (context, index) {
        final badge = _earnedBadges[index];
        return Column(
          children: [
            // Use Image.network to load the badge image from the URL.
            Image.network(badge.imageUrl, height: 80, fit: BoxFit.contain),
            const SizedBox(height: 8),
            Text(badge.name, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        );
      },
    );
  }
}