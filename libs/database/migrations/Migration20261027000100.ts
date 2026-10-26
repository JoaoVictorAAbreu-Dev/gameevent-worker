import { Migration } from '@mikro-orm/migrations';

export class Migration20261027000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table processed_events (
      id uuid primary key,
      event_id varchar(100) not null unique,
      event_type varchar(40) not null,
      version integer not null,
      payload_hash varchar(64) not null,
      processed_at timestamptz not null,
      constraint processed_events_version_check check (version = 1),
      constraint processed_events_type_check check (event_type = 'match.finished')
    );`);
    this.addSql(`create table match_results (
      id uuid primary key,
      processed_event_id uuid not null unique references processed_events(id) on update cascade on delete restrict,
      match_id varchar(100) not null,
      player_id varchar(100) not null,
      score integer not null,
      finished_at timestamptz not null,
      constraint match_results_score_check check (score between 0 and 1000000)
    );`);
    this.addSql('create index match_results_match_id_index on match_results (match_id);');
  }
  override async down(): Promise<void> {
    this.addSql('drop table match_results;');
    this.addSql('drop table processed_events;');
  }
}
