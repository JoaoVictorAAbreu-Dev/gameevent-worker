import { Migration } from '@mikro-orm/migrations';

export class Migration20261027000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table processed_events rename constraint processed_events_event_id_key to processed_events_event_id_unique;');
    this.addSql('alter table match_results rename constraint match_results_processed_event_id_key to match_results_processed_event_id_unique;');
    this.addSql('alter table match_results rename constraint match_results_processed_event_id_fkey to match_results_processed_event_id_foreign;');
  }
  override async down(): Promise<void> {
    this.addSql('alter table processed_events rename constraint processed_events_event_id_unique to processed_events_event_id_key;');
    this.addSql('alter table match_results rename constraint match_results_processed_event_id_unique to match_results_processed_event_id_key;');
    this.addSql('alter table match_results rename constraint match_results_processed_event_id_foreign to match_results_processed_event_id_fkey;');
  }
}
