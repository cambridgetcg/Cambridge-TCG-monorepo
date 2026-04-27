CREATE TABLE wanted_cards (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX wanted_cards_client_card_idx ON wanted_cards(client_id, card_id);
