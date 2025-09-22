# ShareRide API Endpoint Separation

## Overview
The ShareRide API has been enhanced to provide clearer endpoint separation for better frontend UX. Previously, the `/my/requests` endpoint combined both incoming and outgoing requests, which was confusing for frontend implementation.

## New API Structure

### 1. GET `/api/shareride/my/requests` - Requests Received
**Purpose**: Get requests made by others to join YOUR rides

**Authentication**: Required (Bearer token)

**Response Structure**:
```json
{
  "success": true,
  "data": [
    {
      "id": "request_id",
      "requester_id": "user_id",
      "ride_id": "ride_id", 
      "status": "pending|accepted|rejected",
      "message": "Request message",
      "created_at": "timestamp",
      "requester": {
        "id": "user_id",
        "name": "User Name",
        "email": "user@example.com",
        "picture": "profile_url"
      },
      "requester_profile": {
        "display_name": "Display Name",
        "profile_image_url": "image_url",
        "custom_user_id": "@username",
        "bio": "User bio"
      },
      "ride": {
        "id": "ride_id",
        "from_location": "Origin",
        "to_location": "Destination", 
        "date": "2024-01-01",
        "time": "14:30",
        "price": 25.00,
        "seats": 3,
        "user_id": "owner_id"
      }
    }
  ],
  "message": "Found X requests on your rides"
}
```

**Use Case**: 
- Display incoming ride requests in "My Rides" section
- Allow ride owners to accept/reject requests
- Show profile information of people wanting to join

### 2. GET `/api/shareride/my/requested` - Requests Sent  
**Purpose**: Get requests YOU made to join other people's rides

**Authentication**: Required (Bearer token)

**Response Structure**:
```json
{
  "success": true,
  "data": [
    {
      "id": "request_id",
      "requester_id": "current_user_id",
      "ride_id": "ride_id",
      "status": "pending|accepted|rejected", 
      "message": "Request message",
      "created_at": "timestamp",
      "ride": {
        "id": "ride_id",
        "from_location": "Origin",
        "to_location": "Destination",
        "date": "2024-01-01", 
        "time": "14:30",
        "price": 25.00,
        "seats": 3,
        "user_id": "owner_id",
        "owner": {
          "id": "owner_id",
          "name": "Owner Name", 
          "email": "owner@example.com",
          "picture": "profile_url"
        }
      },
      "ride_owner_profile": {
        "display_name": "Owner Display Name",
        "profile_image_url": "image_url", 
        "custom_user_id": "@owner_username",
        "bio": "Owner bio"
      }
    }
  ],
  "message": "Found X ride requests you made"
}
```

**Use Case**:
- Display outgoing requests in "My Requests" section
- Show status of requests user made
- Allow users to cancel pending requests
- Show profile information of ride owners

## Frontend Integration

### Requests Dashboard
```javascript
// Get requests received on my rides
const incomingRequests = await fetch('/api/shareride/my/requests', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Get requests I made to join rides  
const outgoingRequests = await fetch('/api/shareride/my/requested', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Display in separate sections
<div className="requests-dashboard">
  <section className="incoming-requests">
    <h3>Requests on My Rides ({incomingRequests.length})</h3>
    {/* Show requests with requester profiles */}
  </section>
  
  <section className="outgoing-requests"> 
    <h3>My Ride Requests ({outgoingRequests.length})</h3>
    {/* Show requests with ride owner profiles */}
  </section>
</div>
```

### Profile Integration Benefits

1. **Rich User Information**: Both endpoints now include profile data from the new profile system
2. **Display Names**: Show custom display names instead of just auth names
3. **Profile Images**: Display user/owner profile pictures for better UX
4. **Custom User IDs**: Show @username handles for easy identification
5. **Bio Information**: Optional bio text for context

## Migration Notes

### Breaking Changes
- `/my/requests` now only returns requests received on your rides
- New `/my/requested` endpoint for requests you made
- Enhanced data structure with profile information

### Frontend Updates Needed
```javascript
// OLD - Single confusing endpoint
const allRequests = await fetch('/api/shareride/my/requests');

// NEW - Clear separation
const receivedRequests = await fetch('/api/shareride/my/requests'); 
const sentRequests = await fetch('/api/shareride/my/requested');
```

### Data Structure Changes
- Added `requester_profile` to requests received
- Added `ride_owner_profile` to requests sent
- Enhanced logging and error messages
- Improved query performance with proper joins

## Security Features

- Both endpoints require authentication
- Users can only see their own requests (received or sent)
- Rate limiting applied through existing middleware
- Profile data is filtered to public fields only
- Proper error handling with detailed logging

## Error Responses

Both endpoints follow the same error format:
```json
{
  "success": false,
  "message": "Error description", 
  "details": "Technical details"
}
```

Common HTTP status codes:
- `401`: Unauthorized (missing/invalid token)
- `500`: Internal server error (database issues)
- `200`: Success with data array (may be empty)

## Performance Considerations

- Requests are ordered by creation date (newest first)
- Profile data is fetched efficiently with single queries per request
- Database joins minimize round trips
- Consider pagination for users with many requests

## Testing Examples

### Test Received Requests
```bash
curl -X GET "http://localhost:4000/api/shareride/my/requests" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Sent Requests  
```bash
curl -X GET "http://localhost:4000/api/shareride/my/requested" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

This separation provides much clearer API semantics and better frontend integration possibilities while maintaining backward compatibility for the core ride sharing functionality.