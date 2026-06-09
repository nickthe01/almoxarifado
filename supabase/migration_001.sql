-- Coluna de categoria
ALTER TABLE almox_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Outros';

-- Colunas para rastreamento de tendência
ALTER TABLE almox_items
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- Atribuir categorias aos itens existentes
UPDATE almox_items SET category = 'Papel'     WHERE name IN ('Cartolina', 'Color set A3', 'Papel microondulado', 'Papel cartão', 'Papel contact');
UPDATE almox_items SET category = 'Modelagem' WHERE name IN ('Massinha', 'Argilinha');
UPDATE almox_items SET category = 'Decoração' WHERE name IN ('Glitter', 'Lantejola');
UPDATE almox_items SET category = 'Adesivos'  WHERE name IN ('Fita de PVC grossa');

-- Trigger: registra o status anterior e o momento da mudança
CREATE OR REPLACE FUNCTION track_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.previous_status   = OLD.status;
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS almox_track_status ON almox_items;
CREATE TRIGGER almox_track_status
  BEFORE UPDATE ON almox_items
  FOR EACH ROW EXECUTE FUNCTION track_status_change();
