# FrotaGov — Fase 10 (Aderência máxima a licitações)

Execução em etapas. Cada bloco só é marcado como concluído após migração + UI + teste.

## Blocos
- [x] 1. Máquinas e equipamentos (cadastro próprio integrado à frota) — migração, página /equipamentos, menu, identificação por patrimônio em todas as telas e 5 bens demonstrativos
- [x] 2. Inteligência de consumo e custos (km/L, L/h, rankings, desvios, evolução de despesas, TCO, economicidade, relatórios e alertas) — área /inteligencia, 3 tabelas, 4 RPCs, 6 relatórios e carga demonstrativa
- [ ] 3. TCO e economicidade — entregue no Bloco 2; revisar apenas ajustes finos (FIPE) no Bloco 4
- [ ] 4. FIPE / valor de referência (conector não configurado)
- [ ] 5. Compatibilidade peça × bem
- [ ] 6. Ordem de Fornecimento de peças (OF)
- [ ] 7. Almoxarifado / estoque da frota
- [ ] 8. Fontes/modalidades de custeio
- [ ] 9. Vistoria / checklist
- [ ] 10. Locações
- [ ] 11. Portal do credenciado
- [ ] 12. Cartão virtual do bem
- [ ] 13. Geolocalização da rede credenciada
- [ ] 14. ESG / sustentabilidade
- [ ] 15. Conectores (DETRAN, SIAFIC, LDAP/SSO, FIPE, webhook, API)
- [ ] 16. API v1 ampliada + webhooks
- [ ] 17. Relatórios novos
- [ ] 18. Migração dos novos tipos
- [ ] 19. Dados demonstrativos + testes obrigatórios

## Decisões de arquitetura
- Máquinas/equipamentos são registrados na mesma tabela `vehicles`, com
  discriminador `asset_class` ('veiculo' | 'equipamento'). Isso mantém, sem
  retrabalho nem quebra, a integração já existente com abastecimentos,
  autorizações, manutenção, peças, pneus, contratos, empenhos, cotas,
  patrimônio, seguros, obrigações, sinistros, limpeza, histórico, alertas,
  relatórios, transparência e migração.
- Nada de exclusão física: cancelamento/inativação com motivo.
- Integrações externas entregues como conector configurável com status
  "não configurado"; nunca declaradas ativas sem credencial oficial.
