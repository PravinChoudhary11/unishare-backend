// services/cleanup.js - Automated cleanup service for outdated data
const supabase = require('../config/supabase');

class CleanupService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    // Run cleanup every hour
    this.cleanupInterval = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  /**
   * Start the automated cleanup service
   */
  start() {
    if (this.isRunning) {
      console.log('🧹 Cleanup service is already running');
      return;
    }

    console.log('🧹 Starting automated cleanup service...');
    this.isRunning = true;
    
    // Run initial cleanup
    this.runCleanup();
    
    // Set up recurring cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.cleanupInterval);

    console.log('✅ Cleanup service started - runs every hour');
  }

  /**
   * Stop the automated cleanup service
   */
  stop() {
    if (!this.isRunning) {
      console.log('🧹 Cleanup service is not running');
      return;
    }

    console.log('🛑 Stopping cleanup service...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('✅ Cleanup service stopped');
  }

  /**
   * Run all cleanup tasks
   */
  async runCleanup() {
    const startTime = Date.now();
    console.log('🧹 Running automated cleanup tasks...');

    try {
      // Run all cleanup tasks in parallel
      const results = await Promise.allSettled([
        this.cleanupOutdatedRides(),
        this.cleanupCancelledRequests()
      ]);

      // Log results
      let successCount = 0;
      let errorCount = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
          const taskNames = ['cleanupOutdatedRides', 'cleanupCancelledRequests'];
          console.error(`❌ Cleanup task ${taskNames[index]} failed:`, result.reason);
        }
      });

      const duration = Date.now() - startTime;
      console.log(`✅ Cleanup completed: ${successCount} successful, ${errorCount} failed (${duration}ms)`);

    } catch (error) {
      console.error('❌ Cleanup service error:', error);
    }
  }

  /**
   * Delete rides that have passed their date and time
   */
  async cleanupOutdatedRides() {
    try {
      const now = new Date();
      console.log('🚗 Cleaning up outdated rides...');

      // Get all rides that are past their date/time
      const { data: outdatedRides, error: fetchError } = await supabase
        .from('shared_rides')
        .select('id, from_location, to_location, date, time, user_id')
        .lt('date', now.toISOString().split('T')[0]); // Rides with dates in the past

      if (fetchError) {
        throw new Error(`Failed to fetch outdated rides: ${fetchError.message}`);
      }

      if (!outdatedRides || outdatedRides.length === 0) {
        console.log('✅ No outdated rides found');
        return { deleted: 0 };
      }

      // Filter rides that are actually past (considering both date and time)
      const ridesToDelete = outdatedRides.filter(ride => {
        const rideDateTime = new Date(`${ride.date}T${ride.time}`);
        return rideDateTime < now;
      });

      if (ridesToDelete.length === 0) {
        console.log('✅ No rides to delete (all are still in future)');
        return { deleted: 0 };
      }

      console.log(`🗑️ Found ${ridesToDelete.length} outdated rides to delete`);

      // Delete outdated rides (cascade will handle related requests)
      const rideIds = ridesToDelete.map(ride => ride.id);
      const { error: deleteError } = await supabase
        .from('shared_rides')
        .delete()
        .in('id', rideIds);

      if (deleteError) {
        throw new Error(`Failed to delete outdated rides: ${deleteError.message}`);
      }

      console.log(`✅ Deleted ${ridesToDelete.length} outdated rides`);
      
      // Log some details about deleted rides
      ridesToDelete.forEach(ride => {
        console.log(`   - Ride ${ride.id}: ${ride.from_location} → ${ride.to_location} (${ride.date} ${ride.time})`);
      });

      return { deleted: ridesToDelete.length };

    } catch (error) {
      console.error('❌ Error cleaning up outdated rides:', error);
      throw error;
    }
  }

  /**
   * Delete cancelled requests that are older than 24 hours
   */
  async cleanupCancelledRequests() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      console.log('🗑️ Cleaning up cancelled requests older than 24 hours...');

      // Define all request tables and their names
      const requestTables = [
        { table: 'room_requests', name: 'Room' },
        { table: 'item_requests', name: 'Item' },
        { table: 'lostfound_requests', name: 'Lost & Found' },
        { table: 'ticket_requests', name: 'Ticket' },
        { table: 'ride_requests', name: 'Ride' }
      ];

      let totalDeleted = 0;

      // Clean up each request table
      for (const { table, name } of requestTables) {
        try {
          const { data: deletedRequests, error } = await supabase
            .from(table)
            .delete()
            .eq('status', 'cancelled')
            .lt('updated_at', twentyFourHoursAgo.toISOString())
            .select('id, created_at, updated_at');

          if (error) {
            console.error(`❌ Error deleting cancelled ${name.toLowerCase()} requests:`, error);
            continue;
          }

          const deletedCount = deletedRequests?.length || 0;
          totalDeleted += deletedCount;

          if (deletedCount > 0) {
            console.log(`✅ Deleted ${deletedCount} cancelled ${name.toLowerCase()} requests`);
          } else {
            console.log(`✅ No old cancelled ${name.toLowerCase()} requests to delete`);
          }

        } catch (tableError) {
          console.error(`❌ Error processing ${table}:`, tableError);
        }
      }

      console.log(`✅ Total cancelled requests deleted: ${totalDeleted}`);
      return { deleted: totalDeleted };

    } catch (error) {
      console.error('❌ Error cleaning up cancelled requests:', error);
      throw error;
    }
  }

  /**
   * Manual cleanup trigger (for testing or manual execution)
   */
  async runManualCleanup() {
    console.log('🧹 Running manual cleanup...');
    await this.runCleanup();
  }

  /**
   * Get cleanup service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.cleanupInterval,
      nextRunIn: this.intervalId ? this.cleanupInterval : null
    };
  }
}

// Create singleton instance
const cleanupService = new CleanupService();

module.exports = cleanupService;