
-- ============================ Resolvedores de referência ============================
CREATE OR REPLACE FUNCTION public.import_ref_unit(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.units
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND (lower(btrim(name)) = lower(btrim(_txt)) OR lower(btrim(coalesce(acronym,''))) = lower(btrim(_txt)))
   ORDER BY active DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.import_ref_vehicle(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.vehicles
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND (upper(regexp_replace(plate,'[^A-Za-z0-9]','','g')) = upper(regexp_replace(_txt,'[^A-Za-z0-9]','','g'))
          OR regexp_replace(coalesce(renavam,''),'\D','','g') = regexp_replace(_txt,'\D','','g')
          OR upper(coalesce(chassis,'')) = upper(btrim(_txt))
          OR upper(coalesce(asset_code,'')) = upper(btrim(_txt)))
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.import_ref_supplier(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.suppliers
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND ((regexp_replace(_txt,'\D','','g') <> '' AND coalesce(cnpj,'') = regexp_replace(_txt,'\D','','g'))
          OR lower(btrim(legal_name)) = lower(btrim(_txt))
          OR lower(btrim(coalesce(trade_name,''))) = lower(btrim(_txt)))
   ORDER BY active DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.import_ref_driver(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.drivers
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND ((regexp_replace(_txt,'\D','','g') <> '' AND coalesce(cpf,'') = regexp_replace(_txt,'\D','','g'))
          OR lower(btrim(full_name)) = lower(btrim(_txt))
          OR lower(btrim(coalesce(license_number,''))) = lower(btrim(_txt)))
   ORDER BY active DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.import_ref_fuel(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.fuel_types
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND (lower(btrim(name)) = lower(btrim(_txt)) OR lower(btrim(coalesce(acronym,''))) = lower(btrim(_txt)))
   ORDER BY active DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.import_ref_contract(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.contracts
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND lower(btrim(number)) = lower(btrim(_txt))
   ORDER BY created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.import_ref_cost_center(_org uuid, _txt text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.cost_centers
   WHERE organization_id = _org AND _txt IS NOT NULL AND btrim(_txt) <> ''
     AND (lower(btrim(code)) = lower(btrim(_txt)) OR lower(btrim(name)) = lower(btrim(_txt)))
   ORDER BY active DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.import_ref_unit(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.import_ref_vehicle(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.import_ref_supplier(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.import_ref_driver(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.import_ref_fuel(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.import_ref_contract(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.import_ref_cost_center(uuid,text) FROM public, anon;

-- ============================== Importação definitiva ==============================
CREATE OR REPLACE FUNCTION public.commit_import_batch(_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.import_batches;
  r public.import_rows;
  d jsonb;
  n_new integer := 0;
  n_upd integer := 0;
  n_skip integer := 0;
  new_id uuid;
  v_unit uuid; v_vehicle uuid; v_supplier uuid; v_driver uuid; v_fuel uuid; v_contract uuid; v_cc uuid;
  legacy text;
BEGIN
  SELECT * INTO b FROM public.import_batches WHERE id = _batch FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF b.organization_id IS DISTINCT FROM public.active_org_id() THEN
    RAISE EXCEPTION 'Lote pertence a outro órgão';
  END IF;
  IF NOT public.can_manage_users() THEN
    RAISE EXCEPTION 'Sem permissão para importar dados neste órgão';
  END IF;
  IF b.status <> 'pronto' THEN
    RAISE EXCEPTION 'O lote precisa estar validado e sem erros bloqueantes (situação atual: %).', b.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.import_rows WHERE batch_id = _batch AND status = 'erro') THEN
    RAISE EXCEPTION 'Existem linhas com erro no lote. Corrija o arquivo e valide novamente.';
  END IF;

  legacy := COALESCE(NULLIF(btrim(b.source_system), ''), 'Migração legada');
  UPDATE public.import_batches SET status = 'importando' WHERE id = _batch;

  FOR r IN SELECT * FROM public.import_rows
            WHERE batch_id = _batch AND imported = false AND status IN ('valido','aviso','duplicado')
            ORDER BY row_number
  LOOP
    d := r.normalized;

    IF r.status = 'duplicado' AND b.duplicate_strategy = 'ignorar' THEN
      n_skip := n_skip + 1; CONTINUE;
    END IF;

    v_unit     := public.import_ref_unit(b.organization_id, d->>'_unit');
    v_vehicle  := public.import_ref_vehicle(b.organization_id, d->>'_vehicle');
    v_supplier := public.import_ref_supplier(b.organization_id, d->>'_supplier');
    v_driver   := public.import_ref_driver(b.organization_id, d->>'_driver');
    v_fuel     := public.import_ref_fuel(b.organization_id, d->>'_fuel');
    v_contract := public.import_ref_contract(b.organization_id, d->>'_contract');
    v_cc       := public.import_ref_cost_center(b.organization_id, d->>'_cost_center');
    new_id := NULL;

    -- ---------------- atualização segura de cadastro existente ----------------
    IF r.status = 'duplicado' AND b.duplicate_strategy = 'atualizar' AND r.duplicate_of IS NOT NULL THEN
      CASE b.module
        WHEN 'unidades' THEN
          UPDATE public.units SET
            acronym = COALESCE(NULLIF(d->>'acronym',''), acronym),
            unit_type = COALESCE(NULLIF(d->>'unit_type','')::unit_type, unit_type),
            manager_name = COALESCE(NULLIF(d->>'manager_name',''), manager_name),
            phone = COALESCE(NULLIF(d->>'phone',''), phone),
            email = COALESCE(NULLIF(d->>'email',''), email),
            updated_at = now()
          WHERE id = r.duplicate_of AND organization_id = b.organization_id;
        WHEN 'veiculos' THEN
          UPDATE public.vehicles SET
            brand = COALESCE(NULLIF(d->>'brand',''), brand),
            model = COALESCE(NULLIF(d->>'model',''), model),
            renavam = COALESCE(NULLIF(d->>'renavam',''), renavam),
            chassis = COALESCE(NULLIF(d->>'chassis',''), chassis),
            asset_code = COALESCE(NULLIF(d->>'asset_code',''), asset_code),
            color = COALESCE(NULLIF(d->>'color',''), color),
            fuel_type = COALESCE(NULLIF(d->>'fuel_type',''), fuel_type),
            vehicle_type = COALESCE(NULLIF(d->>'vehicle_type',''), vehicle_type),
            unit_id = COALESCE(v_unit, unit_id),
            -- quilometragem nunca regride em atualização de cadastro
            current_km = GREATEST(COALESCE(current_km, 0), COALESCE(NULLIF(d->>'current_km','')::numeric, 0)),
            updated_at = now()
          WHERE id = r.duplicate_of AND organization_id = b.organization_id;
        WHEN 'condutores' THEN
          UPDATE public.drivers SET
            cpf = COALESCE(NULLIF(d->>'cpf',''), cpf),
            license_number = COALESCE(NULLIF(d->>'license_number',''), license_number),
            license_expiry = COALESCE(NULLIF(d->>'license_expiry','')::date, license_expiry),
            phone = COALESCE(NULLIF(d->>'phone',''), phone),
            email = COALESCE(NULLIF(d->>'email',''), email),
            unit_id = COALESCE(v_unit, unit_id),
            updated_at = now()
          WHERE id = r.duplicate_of AND organization_id = b.organization_id;
        WHEN 'fornecedores' THEN
          UPDATE public.suppliers SET
            trade_name = COALESCE(NULLIF(d->>'trade_name',''), trade_name),
            cnpj = COALESCE(NULLIF(d->>'cnpj',''), cnpj),
            city = COALESCE(NULLIF(d->>'city',''), city),
            state = COALESCE(NULLIF(d->>'state',''), state),
            phone = COALESCE(NULLIF(d->>'phone',''), phone),
            email = COALESCE(NULLIF(d->>'email',''), email),
            updated_at = now()
          WHERE id = r.duplicate_of AND organization_id = b.organization_id;
        WHEN 'produtos' THEN
          UPDATE public.fuel_types SET
            acronym = COALESCE(NULLIF(d->>'acronym',''), acronym),
            category = COALESCE(NULLIF(d->>'category',''), category),
            measure_unit = COALESCE(NULLIF(d->>'measure_unit',''), measure_unit),
            updated_at = now()
          WHERE id = r.duplicate_of AND organization_id = b.organization_id;
        WHEN 'centros_custo' THEN
          UPDATE public.cost_centers SET
            name = COALESCE(NULLIF(d->>'name',''), name),
            description = COALESCE(NULLIF(d->>'description',''), description),
            unit_id = COALESCE(v_unit, unit_id),
            updated_at = now()
          WHERE id = r.duplicate_of AND organization_id = b.organization_id;
        ELSE
          RAISE EXCEPTION 'Atualização de registro existente não é permitida no módulo % (dado histórico).', b.module;
      END CASE;
      UPDATE public.import_rows SET imported = true, target_id = r.duplicate_of WHERE id = r.id;
      n_upd := n_upd + 1;
      CONTINUE;
    END IF;

    -- ------------------------------ inserção nova ------------------------------
    CASE b.module
      WHEN 'unidades' THEN
        INSERT INTO public.units (organization_id, name, acronym, unit_type, manager_name, manager_role,
                                  phone, email, active, created_by, import_batch_id)
        VALUES (b.organization_id, d->>'name', NULLIF(d->>'acronym',''),
                COALESCE(NULLIF(d->>'unit_type','')::unit_type, 'secretaria'),
                NULLIF(d->>'manager_name',''), NULLIF(d->>'manager_role',''),
                NULLIF(d->>'phone',''), NULLIF(d->>'email',''), true, auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'veiculos' THEN
        INSERT INTO public.vehicles (organization_id, unit_id, plate, asset_code, renavam, chassis, brand, model,
                                     year_manufacture, year_model, color, vehicle_type, fuel_type, tank_capacity,
                                     current_km, hour_meter, status, notes, created_by, import_batch_id)
        VALUES (b.organization_id, v_unit, upper(d->>'plate'), NULLIF(d->>'asset_code',''),
                NULLIF(d->>'renavam',''), NULLIF(d->>'chassis',''), NULLIF(d->>'brand',''), NULLIF(d->>'model',''),
                NULLIF(d->>'year_manufacture','')::int, NULLIF(d->>'year_model','')::int, NULLIF(d->>'color',''),
                NULLIF(d->>'vehicle_type',''), NULLIF(d->>'fuel_type',''), NULLIF(d->>'tank_capacity','')::numeric,
                GREATEST(COALESCE(NULLIF(d->>'current_km','')::numeric, 0), 0),
                NULLIF(d->>'hour_meter','')::numeric,
                COALESCE(NULLIF(d->>'status','')::vehicle_status, 'ativo'),
                NULLIF(d->>'notes',''), auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'condutores' THEN
        INSERT INTO public.drivers (organization_id, unit_id, full_name, cpf, registration_number, bond_type,
                                    phone, email, license_number, license_categories, license_expiry,
                                    active, notes, created_by, import_batch_id)
        VALUES (b.organization_id, v_unit, d->>'full_name', NULLIF(d->>'cpf',''),
                NULLIF(d->>'registration_number',''),
                COALESCE(NULLIF(d->>'bond_type','')::driver_bond, 'efetivo'),
                NULLIF(d->>'phone',''), NULLIF(d->>'email',''), NULLIF(d->>'license_number',''),
                CASE WHEN COALESCE(d->>'license_categories','') = '' THEN NULL
                     ELSE string_to_array(upper(replace(d->>'license_categories', ' ', '')), ',') END,
                NULLIF(d->>'license_expiry','')::date, true, NULLIF(d->>'notes',''), auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'fornecedores' THEN
        INSERT INTO public.suppliers (organization_id, legal_name, trade_name, cnpj, state_registration, address,
                                      city, state, zip_code, phone, email, contact_name, notes, active,
                                      created_by, import_batch_id)
        VALUES (b.organization_id, d->>'legal_name', NULLIF(d->>'trade_name',''), NULLIF(d->>'cnpj',''),
                NULLIF(d->>'state_registration',''), NULLIF(d->>'address',''), NULLIF(d->>'city',''),
                NULLIF(d->>'state',''), NULLIF(d->>'zip_code',''), NULLIF(d->>'phone',''), NULLIF(d->>'email',''),
                NULLIF(d->>'contact_name',''), NULLIF(d->>'notes',''), true, auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'produtos' THEN
        INSERT INTO public.fuel_types (organization_id, name, acronym, category, measure_unit, active,
                                       created_by, import_batch_id)
        VALUES (b.organization_id, d->>'name', NULLIF(d->>'acronym',''),
                COALESCE(NULLIF(d->>'category',''), 'combustivel'),
                COALESCE(NULLIF(d->>'measure_unit',''), 'litro'), true, auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'centros_custo' THEN
        INSERT INTO public.cost_centers (organization_id, unit_id, code, name, description, active,
                                         created_by, import_batch_id)
        VALUES (b.organization_id, v_unit, d->>'code', d->>'name', NULLIF(d->>'description',''), true,
                auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'contratos' THEN
        INSERT INTO public.contracts (organization_id, number, process_number, modality, object, supplier_id, cnpj,
                                      signed_at, valid_from, valid_to, initial_value, current_value, status,
                                      notes, created_by, import_batch_id)
        VALUES (b.organization_id, d->>'number', NULLIF(d->>'process_number',''),
                COALESCE(NULLIF(d->>'modality','')::contract_modality, 'pregao'), d->>'object', v_supplier,
                NULLIF(regexp_replace(COALESCE(d->>'cnpj',''), '\D', '', 'g'), ''),
                NULLIF(d->>'signed_at','')::date, NULLIF(d->>'valid_from','')::date, NULLIF(d->>'valid_to','')::date,
                COALESCE(NULLIF(d->>'initial_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'initial_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'status','')::contract_status, 'vigente'),
                NULLIF(d->>'notes',''), auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'empenhos' THEN
        INSERT INTO public.commitments (organization_id, number, exercise, issued_at, kind, contract_id, supplier_id,
                                        cost_center_id, unit_id, budget_allocation, resource_source, expense_element,
                                        committed_value, status, notes, created_by, import_batch_id)
        VALUES (b.organization_id, d->>'number',
                COALESCE(NULLIF(d->>'exercise','')::int, EXTRACT(YEAR FROM COALESCE(NULLIF(d->>'issued_at','')::date, current_date))::int),
                NULLIF(d->>'issued_at','')::date,
                COALESCE(NULLIF(d->>'kind','')::commitment_kind, 'estimativo'),
                v_contract, v_supplier, v_cc, v_unit,
                NULLIF(d->>'budget_allocation',''), NULLIF(d->>'resource_source',''), NULLIF(d->>'expense_element',''),
                COALESCE(NULLIF(d->>'committed_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'status','')::commitment_status, 'ativo'),
                NULLIF(d->>'notes',''), auth.uid(), _batch)
        RETURNING id INTO new_id;

      WHEN 'abastecimentos' THEN
        -- histórico legado: sem autorização eletrônica e sem vínculo financeiro corrente
        INSERT INTO public.fuelings (organization_id, vehicle_id, unit_id, supplier_id, fuel_type_id, fueled_at,
                                     driver_name, odometer_km, hour_meter, quantity, unit_price, invoice_number,
                                     document_kind, notes, status, created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, v_unit, v_supplier, v_fuel,
                (d->>'fueled_at')::timestamptz, NULLIF(d->>'driver_name',''),
                NULLIF(d->>'odometer_km','')::numeric, NULLIF(d->>'hour_meter','')::numeric,
                (d->>'quantity')::numeric, (d->>'unit_price')::numeric, NULLIF(d->>'invoice_number',''),
                NULLIF(d->>'document_kind',''), NULLIF(d->>'notes',''), 'valido', auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'utilizacoes' THEN
        INSERT INTO public.vehicle_usages (organization_id, vehicle_id, unit_id, driver_id, requester_name,
                                           planned_departure, planned_return, actual_departure, actual_return,
                                           origin, destination, purpose, start_km, end_km, status, notes,
                                           created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, v_unit, v_driver, NULLIF(d->>'requester_name',''),
                COALESCE(NULLIF(d->>'planned_departure','')::timestamptz, (d->>'actual_departure')::timestamptz),
                NULLIF(d->>'planned_return','')::timestamptz,
                NULLIF(d->>'actual_departure','')::timestamptz, NULLIF(d->>'actual_return','')::timestamptz,
                NULLIF(d->>'origin',''), NULLIF(d->>'destination',''), NULLIF(d->>'purpose',''),
                NULLIF(d->>'start_km','')::numeric, NULLIF(d->>'end_km','')::numeric,
                COALESCE(NULLIF(d->>'status','')::usage_status, 'concluida'),
                NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'manutencoes' THEN
        INSERT INTO public.maintenance_records (organization_id, vehicle_id, unit_id, supplier_id, kind, entry_at,
                                                exit_at, services, odometer_km, labor_value, parts_value, other_value,
                                                total_value, invoice_number, notes, status, created_by,
                                                import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, v_unit, v_supplier,
                COALESCE(NULLIF(d->>'kind','')::maintenance_kind, 'corretiva'),
                (d->>'entry_at')::timestamptz, NULLIF(d->>'exit_at','')::timestamptz,
                d->>'services', NULLIF(d->>'odometer_km','')::numeric,
                COALESCE(NULLIF(d->>'labor_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'parts_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'other_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'total_value','')::numeric, 0),
                NULLIF(d->>'invoice_number',''), NULLIF(d->>'notes',''),
                COALESCE(NULLIF(d->>'status','')::maintenance_record_status, 'concluida'),
                auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'multas' THEN
        INSERT INTO public.traffic_fines (organization_id, vehicle_id, unit_id, driver_id, notice_number,
                                          issuing_authority, infraction_code, description, occurred_at, location,
                                          amount, due_date, status, liability, responsible_name, notes,
                                          created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, v_unit, v_driver, d->>'notice_number',
                NULLIF(d->>'issuing_authority',''), NULLIF(d->>'infraction_code',''), NULLIF(d->>'description',''),
                (d->>'occurred_at')::timestamptz, NULLIF(d->>'location',''),
                COALESCE(NULLIF(d->>'amount','')::numeric, 0), NULLIF(d->>'due_date','')::date,
                COALESCE(NULLIF(d->>'status','')::fine_status, 'recebida'),
                COALESCE(NULLIF(d->>'liability','')::fine_liability, 'nao_definida'),
                NULLIF(d->>'responsible_name',''), NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'seguros' THEN
        INSERT INTO public.insurance_policies (organization_id, insurer_name, supplier_id, policy_number, contract_id,
                                               valid_from, valid_to, premium_value, deductible_value, coverages,
                                               notes, status, created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, d->>'insurer_name', v_supplier, d->>'policy_number', v_contract,
                (d->>'valid_from')::date, (d->>'valid_to')::date,
                NULLIF(d->>'premium_value','')::numeric, NULLIF(d->>'deductible_value','')::numeric,
                NULLIF(d->>'coverages',''), NULLIF(d->>'notes',''),
                COALESCE(NULLIF(d->>'status','')::insurance_status, 'ativa'), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'obrigacoes' THEN
        INSERT INTO public.vehicle_obligations (organization_id, vehicle_id, obligation_type, exercise,
                                                document_number, due_date, amount, status, notes,
                                                created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, d->>'obligation_type',
                COALESCE(NULLIF(d->>'exercise','')::int, EXTRACT(YEAR FROM (d->>'due_date')::date)::int),
                NULLIF(d->>'document_number',''), (d->>'due_date')::date,
                NULLIF(d->>'amount','')::numeric,
                COALESCE(NULLIF(d->>'status','')::obligation_status, 'pendente'),
                NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'patrimonio' THEN
        INSERT INTO public.asset_movements (organization_id, vehicle_id, kind, moved_on, unit_id, owner_name,
                                            holder_name, reason, odometer_km, asset_code, act_number, notes,
                                            created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, (d->>'kind')::asset_movement_kind,
                COALESCE(NULLIF(d->>'moved_on','')::date, current_date), v_unit,
                NULLIF(d->>'owner_name',''), NULLIF(d->>'holder_name',''), NULLIF(d->>'reason',''),
                NULLIF(d->>'odometer_km','')::numeric, NULLIF(d->>'asset_code',''), NULLIF(d->>'act_number',''),
                NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'entidades' THEN
        INSERT INTO public.external_entities (organization_id, kind, name, document, address, city, state,
                                              phone, email, notes, active, created_by, import_batch_id)
        VALUES (b.organization_id, COALESCE(NULLIF(d->>'kind','')::entity_kind, 'pj'), d->>'name',
                NULLIF(regexp_replace(COALESCE(d->>'document',''), '\D', '', 'g'), ''),
                NULLIF(d->>'address',''), NULLIF(d->>'city',''), NULLIF(d->>'state',''),
                NULLIF(d->>'phone',''), NULLIF(d->>'email',''), NULLIF(d->>'notes',''), true, auth.uid(), _batch)
        RETURNING id INTO new_id;

      ELSE
        RAISE EXCEPTION 'Módulo de importação desconhecido: %', b.module;
    END CASE;

    UPDATE public.import_rows SET imported = true, target_id = new_id WHERE id = r.id;
    n_new := n_new + 1;
  END LOOP;

  UPDATE public.import_batches
     SET status = 'concluido',
         imported_rows = n_new + n_upd,
         completed_at = now(),
         result = jsonb_build_object('criados', n_new, 'atualizados', n_upd, 'ignorados', n_skip,
                                     'modulo', b.module, 'origem', legacy)
   WHERE id = _batch;

  PERFORM public.log_event('import.commit', 'Implantação', 'Importação e migração', '/plataforma',
                           'import_batches', _batch, 'importar',
                           'Lote ' || b.module || ' importado: ' || (n_new + n_upd) || ' registro(s)',
                           NULL, jsonb_build_object('criados', n_new, 'atualizados', n_upd, 'ignorados', n_skip));

  RETURN jsonb_build_object('criados', n_new, 'atualizados', n_upd, 'ignorados', n_skip);
END; $$;
REVOKE ALL ON FUNCTION public.commit_import_batch(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.commit_import_batch(uuid) TO authenticated;

-- ================================ Anulação de lote ================================
CREATE OR REPLACE FUNCTION public.annul_import_batch(_batch uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.import_batches; affected integer := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o Super Admin da plataforma pode anular um lote concluído';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Informe a justificativa da anulação';
  END IF;
  SELECT * INTO b FROM public.import_batches WHERE id = _batch FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF b.status <> 'concluido' THEN RAISE EXCEPTION 'Somente lotes concluídos podem ser anulados'; END IF;

  UPDATE public.fuelings SET status = 'cancelado', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelado';
  UPDATE public.vehicle_usages SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.maintenance_records SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.traffic_fines SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.insurance_policies SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.vehicle_obligations SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.units SET active = false WHERE import_batch_id = _batch;
  UPDATE public.drivers SET active = false WHERE import_batch_id = _batch;
  UPDATE public.suppliers SET active = false WHERE import_batch_id = _batch;
  UPDATE public.fuel_types SET active = false WHERE import_batch_id = _batch;
  UPDATE public.cost_centers SET active = false WHERE import_batch_id = _batch;
  UPDATE public.external_entities SET active = false WHERE import_batch_id = _batch;
  UPDATE public.vehicles SET status = 'inativo' WHERE import_batch_id = _batch AND status <> 'baixado';
  UPDATE public.contracts SET status = 'encerrado' WHERE import_batch_id = _batch;
  UPDATE public.commitments SET status = 'anulado' WHERE import_batch_id = _batch;

  SELECT count(*) INTO affected FROM public.import_rows WHERE batch_id = _batch AND imported;

  UPDATE public.import_batches
     SET status = 'anulado', annulled_at = now(), annulled_by = auth.uid(), annul_reason = _reason
   WHERE id = _batch;

  PERFORM public.log_event('import.annul', 'Implantação', 'Importação e migração', '/plataforma',
                           'import_batches', _batch, 'anular',
                           'Lote ' || b.module || ' anulado', NULL,
                           jsonb_build_object('motivo', _reason, 'registros', affected));

  RETURN jsonb_build_object('registros', affected);
END; $$;
REVOKE ALL ON FUNCTION public.annul_import_batch(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.annul_import_batch(uuid, text) TO authenticated;
