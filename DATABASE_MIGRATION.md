# Database Migration: SQL to Sequelize Seeders

## Overview

This document outlines the migration from raw SQL database initialization to Sequelize seeders for better maintainability and type safety.

## What Was Changed

### 1. Replaced SQL Files with Sequelize Seeders

**Old SQL Files:**
- `database/schema.sql` - Main database schema and AI prompts
- `database/sentiment_analysis_update.sql` - Sentiment analysis tables and data
- `database/toxic_detection_update.sql` - Toxic detection tables and data

**New Sequelize Seeders:**
- `backend/seeders/ai-prompts-seeder.js` - AI prompts data
- `backend/seeders/spam-patterns-seeder.js` - Spam detection patterns
- `backend/seeders/sentiment-keywords-seeder.js` - Sentiment analysis keywords
- `backend/seeders/toxic-keywords-seeder.js` - Toxic content keywords
- `backend/seeders/index.js` - Main seeder orchestrator

### 2. Fixed Runtime Errors

**Issues Fixed:**
- `AIPrompt.getProcessedPrompt is not a function` - Created `AIPromptService` using Sequelize `AIPrompt` model
- `Cannot read properties of undefined (reading 'ne')` - Fixed Sequelize operator usage with proper `Op` imports

**Files Updated:**
- `backend/services/AIPromptService.js` - New service for AI prompts
- `backend/services/CommentService.js` - Uses new `AIPromptService`
- `backend/services/TextProcessingService.js` - Fixed Sequelize operators
- `backend/services/SentimentAnalysisService.js` - Fixed Sequelize operators
- `backend/services/ToxicDetectionService.js` - Fixed Sequelize operators
- `backend/services/ModerationService.js` - Fixed Sequelize operators

### 3. Updated Package Scripts

**New Scripts Added:**
```json
{
  "seed": "node seeders/index.js",
  "seed:ai-prompts": "node -e \"require('./seeders/ai-prompts-seeder.js')()\"",
  "seed:spam-patterns": "node -e \"require('./seeders/spam-patterns-seeder.js')()\"",
  "seed:sentiment": "node -e \"require('./seeders/sentiment-keywords-seeder.js')()\"",
  "seed:toxic": "node -e \"require('./seeders/toxic-keywords-seeder.js')()\"",
  "init-sequelize": "node scripts/init-sequelize-db.js",
  "db:setup": "npm run seed",
  "db:reset": "npm run seed"
}
```

## Migration Guide

### For New Setup

**Old Way:**
```bash
npm run init-all  # Runs SQL scripts
```

**New Way:**
```bash
npm run init-sequelize  # Creates DB + tables + seeds data
```

### For Data Seeding Only

**Old Way:**
```bash
# Manual SQL execution
mysql -u root -p fb_comment_db < database/schema.sql
mysql -u root -p fb_comment_db < database/sentiment_analysis_update.sql
mysql -u root -p fb_comment_db < database/toxic_detection_update.sql
```

**New Way:**
```bash
npm run seed  # Seeds all data using Sequelize
```

### For Individual Data Types

```bash
npm run seed:ai-prompts      # AI prompts only
npm run seed:spam-patterns   # Spam patterns only
npm run seed:sentiment       # Sentiment keywords only
npm run seed:toxic           # Toxic keywords only
```

## Benefits of Migration

### 1. **Type Safety**
- Uses Sequelize models with proper validation
- Compile-time error checking
- Better IDE support

### 2. **Maintainability**
- Modular seeder files
- Easy to modify individual data types
- Clear separation of concerns

### 3. **Idempotent Operations**
- Can be run multiple times safely
- Uses `upsert()` to avoid duplicates
- No manual cleanup required

### 4. **Better Error Handling**
- Detailed logging and progress tracking
- Graceful error handling
- Clear success/failure reporting

### 5. **Development Experience**
- NPM scripts for easy execution
- Individual seeder execution
- Consistent with modern Node.js practices

## Data Preserved

All original data from SQL files has been preserved:

### AI Prompts
- Complete Golden Hour watch sales assistant prompt
- All template variables and instructions

### Spam Patterns
- 14 Vietnamese spam detection patterns
- Keywords, regex, domains, and phone patterns

### Sentiment Keywords
- 23 Vietnamese sentiment analysis keywords
- Positive, negative, and neutral categories
- Proper weight assignments

### Toxic Keywords
- 23 Vietnamese toxic content keywords
- Profanity, insults, hate speech, and violence categories
- Severity levels for each keyword

## Next Steps

1. **Remove Legacy SQL Files** (Optional)
   - `database/schema.sql`
   - `database/sentiment_analysis_update.sql`
   - `database/toxic_detection_update.sql`

2. **Update Documentation**
   - Remove references to old SQL scripts
   - Update deployment guides

3. **Test Migration**
   - Verify all data is seeded correctly
   - Test application functionality
   - Confirm no runtime errors

## Troubleshooting

### If Seeding Fails
```bash
# Check database connection
npm run init-sequelize

# Run individual seeders to isolate issues
npm run seed:ai-prompts
```

### If Data is Missing
```bash
# Re-run all seeders
npm run db:reset
```

### Database Connection Issues
- Verify `.env` file has correct database credentials
- Ensure MySQL server is running
- Check database permissions
