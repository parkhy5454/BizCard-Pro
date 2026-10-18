# Neon PostgreSQL Setup Guide

## Migration Status

✅ **Database migration complete** - 2,650 total rows

- `scoped_items`: 2,640 rows (contacts, driving logs, projects, groups, etc.)
- `users`: 1 row (parkhy5454@gmail.com)
- `audit_logs`: 9 rows

All data has been successfully migrated from Supabase to Neon PostgreSQL.

## Environment Variables

### Local Development

Create a `.env.local` file in the project root with:

```env
NEON_DATABASE_URL=postgresql://neondb_owner:npg_N3jW5FMhlzQy@ep-square-sea-b38ns78c-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
NODE_ENV=development
```

### Render Deployment

Add these environment variables in your Render Web Service dashboard:

1. **NEON_DATABASE_URL**: (set to the full connection string from Neon)
2. **NODE_ENV**: production
3. Other API keys (GOOGLE_CLOUD_PROJECT_ID, GEMINI_API_KEY, etc.)

## Database Connection Test

To verify your connection works in Node.js:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL
});

pool.query('SELECT version();', (err, res) => {
  if (err) {
    console.error('Connection failed:', err);
  } else {
    console.log('Connected to Neon:', res.rows[0]);
  }
  pool.end();
});
```

## Verification Queries

Test data in your Neon database:

```sql
-- Check total row counts
SELECT COUNT(*) as scoped_items_count FROM scoped_items;
SELECT COUNT(*) as users_count FROM users;
SELECT COUNT(*) as audit_logs_count FROM audit_logs;

-- Check specific user
SELECT id, email, role FROM users WHERE email = 'parkhy5454@gmail.com';

-- Check collections distribution
SELECT 
  CAST(data->>'collection' as VARCHAR) as collection,
  COUNT(*) as count
FROM scoped_items
GROUP BY data->>'collection'
ORDER BY count DESC;
```

## Render Deployment Steps

1. **Create Web Service**
   - Connect your GitHub repository
   - Set build command: `npm install && npm run build`
   - Set start command: `npm start`

2. **Configure Environment**
   - Add NEON_DATABASE_URL in environment variables
   - Set NODE_ENV to production

3. **Deploy**
   - Render will automatically deploy on main branch updates
   - Monitor deployment logs for connection issues

## Security Notes

⚠️ **Never commit .env.local** - it contains database credentials
- Add `.env.local` to .gitignore
- Use .env.example as a template
- Set all sensitive values in Render dashboard

## Troubleshooting

### Connection Timeouts
- Check Neon project is active in Neon dashboard
- Verify IP allowlist settings if applicable
- Ensure sslmode=require is in connection string

### Query Errors
- Verify schema exists: `\dt` in Neon SQL Editor
- Check column names match application expectations
- Review migration logs for any skipped rows

### Deployment Issues
- Check Render build logs for npm errors
- Verify all environment variables are set
- Test local connection before pushing to Render
