# FrotaGov — Fase 10 (Aderência máxima a licitações)

Execução em etapas. Cada bloco só é marcado como concluído após migração + UI + teste.

## Blocos
- [x] 1. Máquinas e equipamentos (cadastro próprio integrado à frota) — migração, página /equipamentos, menu, identificação por patrimônio em todas as telas e 5 bens demonstrativos
- [x] 2. Inteligência de consumo e custos (km/L, L/h, rankings, desvios, evolução de despesas, TCO, economicidade, relatórios e alertas) — área /inteligencia, 3 tabelas, 4 RPCs, 6 relatórios e carga demonstrativa
- [ ] 3. TCO e economicidade — entregue no Bloco 2; revisar apenas ajustes finos (FIPE) no Bloco 4
- [x] 4. FIPE / valor de mercado — tabela `asset_market_values`, componente e aba na ficha do bem, integração ao TCO; conector FIPE sem credencial permanece "não configurado"
- [x] 5. Compatibilidade peça × bem
- [x] 6. Ordem de Fornecimento de peças (OFP) — /ofp
- [x] 7. Almoxarifado / estoque da frota — /almoxarifado
- [ ] 8. Fontes/modalidades de custeio
- [ ] 9. Vistoria / checklist
- [ ] 10. Locações
- [x] 11. Portal do credenciado — /portal-credenciado
- [x] 12. Cartão virtual do bem (QR, sem POS/adquirência)
- [x] 13. Geolocalização da rede credenciada — /mapa-rede, busca por proximidade
- [x] 14. ESG / sustentabilidade — /sustentabilidade com fatores parametrizáveis
- [x] 15. Conectores (DETRAN, SIAFIC, LDAP/SSO, FIPE, webhook, API) — /integracoes
- [x] 16. API v1 ampliada (18 recursos, escopos, filtros, 429, auditoria) + webhooks com HMAC e reenvio com backoff
- [ ] 17. Relatórios finais de aderência (cabeçalho institucional, CSV/XLSX/PDF)
- [x] 18. Migração/exportação dos novos tipos — exportação v10.6.0 com pasta 14_integracoes
- [ ] 19. Regressão geral dos Blocos 1–6 com usuário autenticado + relatório final de aderência

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
