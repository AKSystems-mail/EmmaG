# Reading Subject QA Roadmap & Checklist

**Goal:** Ensure every level has a cohesive "Single Scene" structure, high-quality Ghibli images, and correct data formatting.

## QA Checklist (Per Topic)
1.  [ ] **Content Generation:** Run `generate_content.py` for the specific topic.
2.  [ ] **Asset Verification:** 
    *   [ ] Check `assets/generated_images/...` count (Should be 40 images).
    *   [ ] Spot check 3 random images for style/quality.
3.  [ ] **Data Verification:**
    *   [ ] Check `generated_content/...` count (Should be 10 JSONs).
    *   [ ] Verify JSON structure (Keywords map, localImagePath).
4.  [ ] **App Test:**
    *   [ ] Upload to Firestore.
    *   [ ] Run App (`flutter run -d chrome`).
    *   [ ] Play Level 1 & Level 10.
    *   [ ] Verify "Single Scene" header & Text Carousel.

## Topic Status

| Topic | Status | Notes |
| :--- | :--- | :--- |
| **1. Phonics: Short Vowels** | ✅ DONE | Verified cohesive style. |
| **2. Basic Sight Words** | ✅ DONE | Gold standard reference. |
| **3. Understanding Sentences** | ✅ DONE | Verified cohesive style. |
| **4. Word Families** | ✅ DONE | Verified cohesive style. |
| **5. Identifying Nouns** | ✅ DONE | Verified cohesive style. |
| **6. Identifying Verbs** | 🔴 PENDING | Next up. |
| **7. Reading Comprehension** | 🔴 PENDING | |
| **8. Sequencing** | 🔴 PENDING | |
| **9. Punctuation** | 🔴 PENDING | |
| **10. Main Idea** | 🔴 PENDING | |
