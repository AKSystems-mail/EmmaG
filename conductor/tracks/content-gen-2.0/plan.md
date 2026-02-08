# Plan: Content Generation 2.0

## Phase 1: Verification & Scripting
- [x] Update `generate_content.py` with Vertex AI & Imagen 4 Fast.
- [x] Test single-level generation (Reading Level 1).
- [ ] Verify generated images for style adherence.

## Phase 2: Bulk Generation
- [ ] Run bulk JSON regeneration (325 levels).
- [ ] Orchestrate image generation in batches to respect quotas.

## Phase 3: Deployment
- [ ] Bulk upload updated JSONs to Firestore.
- [ ] Upload images to Firebase Storage (if needed) or assets folder.
