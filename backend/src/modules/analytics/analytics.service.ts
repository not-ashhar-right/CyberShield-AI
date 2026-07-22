import { prisma } from "../../config/database.js";

export const analyticsService = {
  async getDashboard() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalScans, highRiskThreats, criticalThreats, reportsSubmitted,
      activeInvestigations, evidenceUploaded, repeatScammers, newVictimsToday
    ] = await Promise.all([
      prisma.threatScan.count(),
      prisma.threatAnalysis.count({ where: { riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
      prisma.threatAnalysis.count({ where: { riskLevel: "CRITICAL" } }),
      prisma.threatReport.count(),
      prisma.investigation.count({ where: { status: "ACTIVE" } }),
      prisma.evidenceUpload.count(),
      prisma.scammerProfile.count({ where: { occurrences: { gte: 2 } } }),
      prisma.user.count({ where: { role: "CITIZEN", createdAt: { gte: today } } }),
    ]);

    return {
      totalScans,
      highRiskThreats,
      criticalThreats,
      reportsSubmitted,
      activeInvestigations,
      evidenceUploaded,
      repeatScammers,
      newVictims: newVictimsToday,
    };
  },

  async getTrends() {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const sevenDaysAgo = new Date(now - 7 * 86400000);

    // Daily scans (last 30 days)
    const dailyScans = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::bigint as count
      FROM threat_scans
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `;

    // Threat category distribution
    const categoryDist = await prisma.threatScan.groupBy({
      by: ["scanType"],
      _count: { id: true },
    });

    // Risk level distribution
    const riskDist = await prisma.threatAnalysis.groupBy({
      by: ["riskLevel"],
      _count: { id: true },
    });

    // Weekly report count (last 4 weeks)
    const weeklyReports = await prisma.$queryRaw<{ week: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('week', "createdAt"), 'YYYY-MM-DD') as week, COUNT(*)::bigint as count
      FROM threat_reports
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY week ASC
    `;

    // Daily high-risk detections (last 7 days)
    const dailyHighRisk = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE(ta."createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::bigint as count
      FROM threat_analyses ta
      WHERE ta."riskLevel" IN ('HIGH', 'CRITICAL')
      AND ta."createdAt" >= ${sevenDaysAgo}
      GROUP BY DATE(ta."createdAt")
      ORDER BY day ASC
    `;

    return {
      dailyScans: dailyScans.map((d) => ({ date: String(d.day).split("T")[0], count: Number(d.count) })),
      categoryDistribution: categoryDist.map((c) => ({ type: c.scanType.toLowerCase(), count: c._count.id })),
      riskDistribution: riskDist.map((r) => ({ level: r.riskLevel.toLowerCase(), count: r._count.id })),
      weeklyReports: weeklyReports.map((w) => ({ week: String(w.week), count: Number(w.count) })),
      dailyHighRisk: dailyHighRisk.map((d) => ({ date: String(d.day).split("T")[0], count: Number(d.count) })),
    };
  },

  async getTopIndicators() {
    // Top entities by type
    const [topPhones, topEmails, topUpis, topDomains, topUrls] = await Promise.all([
      prisma.graphNode.findMany({ where: { entityType: "PHONE" }, orderBy: { occurrences: "desc" }, take: 10 }),
      prisma.graphNode.findMany({ where: { entityType: "EMAIL" }, orderBy: { occurrences: "desc" }, take: 10 }),
      prisma.graphNode.findMany({ where: { entityType: "UPI" }, orderBy: { occurrences: "desc" }, take: 10 }),
      prisma.graphNode.findMany({ where: { entityType: "DOMAIN" }, orderBy: { occurrences: "desc" }, take: 10 }),
      prisma.graphNode.findMany({ where: { entityType: "URL" }, orderBy: { occurrences: "desc" }, take: 10 }),
    ]);

    const format = (nodes: any[]) => nodes.map((n, i) => ({
      rank: i + 1,
      id: n.id,
      value: n.value,
      occurrences: n.occurrences,
      riskLevel: n.riskLevel.toLowerCase(),
      firstSeen: n.firstSeen.toISOString(),
      lastSeen: n.lastSeen.toISOString(),
    }));

    return {
      phones: format(topPhones),
      emails: format(topEmails),
      upis: format(topUpis),
      domains: format(topDomains),
      urls: format(topUrls),
    };
  },

  async getActivityFeed(limit = 30) {
    const events = await prisma.timelineEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      severity: e.severity,
      actorType: e.actorType,
      timestamp: e.createdAt.toISOString(),
      relatedReport: e.relatedReport,
      relatedIncident: e.relatedIncident,
      relatedEvidence: e.relatedEvidence,
      relatedAnalysis: e.relatedAnalysis,
    }));
  },

  async getRepeatScammers(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.scammerProfile.findMany({
        orderBy: { occurrences: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.scammerProfile.count(),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id,
        primaryContact: s.phones[0] || s.emails[0] || s.upiIds[0] || "Unknown",
        phones: s.phones,
        emails: s.emails,
        upiIds: s.upiIds,
        domains: s.domains,
        threatLevel: s.threatLevel.toLowerCase(),
        occurrences: s.occurrences,
        totalReports: s.totalReports,
        aliases: s.aliases,
        firstSeen: s.firstSeen.toISOString(),
        lastSeen: s.lastSeen.toISOString(),
      })),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  },

  async getScammerById(id: string) {
    const profile = await prisma.scammerProfile.findUnique({ where: { id } });
    if (!profile) return null;

    // Get linked reports
    const reports = profile.reportIds.length > 0
      ? await prisma.threatReport.findMany({
          where: { id: { in: profile.reportIds } },
          select: { id: true, reportNumber: true, type: true, status: true, description: true, createdAt: true, userId: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Get unique victim count
    const victimIds = [...new Set(reports.map((r) => r.userId))];

    return {
      id: profile.id,
      phones: profile.phones,
      emails: profile.emails,
      upiIds: profile.upiIds,
      domains: profile.domains,
      urls: profile.urls,
      walletIds: profile.walletIds,
      aliases: profile.aliases,
      threatLevel: profile.threatLevel.toLowerCase(),
      occurrences: profile.occurrences,
      totalReports: profile.totalReports,
      totalVictims: victimIds.length,
      graphNodeIds: profile.graphNodeIds,
      firstSeen: profile.firstSeen.toISOString(),
      lastSeen: profile.lastSeen.toISOString(),
      reports: reports.map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        type: r.type,
        status: r.status.toLowerCase(),
        description: r.description.slice(0, 100),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },

  async getScammerTimeline(id: string) {
    const profile = await prisma.scammerProfile.findUnique({ where: { id } });
    if (!profile) return [];

    // Get timeline events related to this scammer's reports
    if (profile.reportIds.length === 0) return [];

    const events = await prisma.timelineEvent.findMany({
      where: { relatedReport: { in: profile.reportIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      severity: e.severity,
      timestamp: e.createdAt.toISOString(),
    }));
  },

  async getScammerSimilar(id: string) {
    const profile = await prisma.scammerProfile.findUnique({ where: { id } });
    if (!profile) return [];

    // Find similar scammers by overlapping entities
    const orConditions: any[] = [];
    if (profile.phones.length > 0) orConditions.push({ phones: { hasSome: profile.phones } });
    if (profile.emails.length > 0) orConditions.push({ emails: { hasSome: profile.emails } });
    if (profile.upiIds.length > 0) orConditions.push({ upiIds: { hasSome: profile.upiIds } });
    if (profile.domains.length > 0) orConditions.push({ domains: { hasSome: profile.domains } });

    if (orConditions.length === 0) return [];

    const similar = await prisma.scammerProfile.findMany({
      where: { AND: [{ id: { not: id } }, { OR: orConditions }] },
      take: 10,
      orderBy: { occurrences: "desc" },
    });

    return similar.map((s) => {
      // Calculate overlap
      const phoneOverlap = s.phones.filter((p) => profile.phones.includes(p)).length;
      const emailOverlap = s.emails.filter((e) => profile.emails.includes(e)).length;
      const upiOverlap = s.upiIds.filter((u) => profile.upiIds.includes(u)).length;
      const totalOverlap = phoneOverlap + emailOverlap + upiOverlap;
      const totalEntities = Math.max(1, s.phones.length + s.emails.length + s.upiIds.length);
      const similarity = Math.round((totalOverlap / totalEntities) * 100);

      return {
        id: s.id,
        primaryContact: s.phones[0] || s.emails[0] || s.upiIds[0] || "Unknown",
        threatLevel: s.threatLevel.toLowerCase(),
        occurrences: s.occurrences,
        similarity,
        sharedEntities: totalOverlap,
      };
    });
  },

  async getThreatMap() {
    // 1. Fetch DB investigations & related evidence
    const dbInvestigations = await prisma.investigation.findMany({
      include: {
        evidence: true
      }
    });

    const CITY_TO_STATE: Record<string, string> = {
      "Mumbai": "Maharashtra",
      "Delhi": "Delhi",
      "Pune": "Maharashtra",
      "Bengaluru": "Karnataka",
      "Kolkata": "West Bengal",
      "Chennai": "Tamil Nadu",
      "Hyderabad": "Telangana",
      "Ahmedabad": "Gujarat",
      "Jaipur": "Rajasthan",
      "Srinagar": "Jammu and Kashmir",
      "Guwahati": "Assam",
      "Patna": "Bihar",
      "Bhubaneswar": "Odisha",
      "Bhopal": "Madhya Pradesh",
      "Ranchi": "Jharkhand",
      "Lucknow": "Uttar Pradesh",
      "Raipur": "Chhattisgarh"
    };

    // Parse DB investigations into Case interface format
    const dbCases = dbInvestigations.map((inv) => {
      const city = inv.city || "Mumbai";
      const state = CITY_TO_STATE[city] || "Maharashtra";
      
      const phones: string[] = [];
      const emails: string[] = [];
      const upis: string[] = [];
      const bankAccounts: string[] = [];
      const ips: string[] = [];
      const devices: string[] = [];
      const qrs: string[] = [];
      const websites: string[] = [];

      inv.evidence.forEach((ev) => {
        const val = ev.value;
        if (!val) return;
        if (ev.type === "PHONE") phones.push(val);
        else if (ev.type === "UPI") upis.push(val);
        else if (ev.type === "DEVICE") devices.push(val);
        else if (ev.type === "DOMAIN") {
          if (val.includes("@")) emails.push(val);
          else websites.push(val);
        }
      });

      return {
        id: inv.caseId || `CYB-DB-${inv.id.slice(0, 8)}`,
        title: inv.title || "Unauthorized Intrusion Case",
        city,
        state,
        crimeType: inv.title?.toLowerCase().includes("loan") ? "UPI Fraud" : "Phishing Campaign",
        status: inv.status || "ACTIVE",
        threatLevel: inv.confidence && inv.confidence >= 90 ? "critical" : "high",
        occurredAt: inv.createdAt.toISOString(),
        confidence: inv.confidence || 80,
        entities: { phones, emails, upis, bankAccounts, ips, devices, qrs, websites }
      };
    });

    // 2. Structured seed mock cases to demonstrate complex multi-city overlapping entities
    const mockCases = [
      {
        id: "CYB-A-001",
        title: "Fake SBI Verification Campaign",
        city: "Mumbai",
        state: "Maharashtra",
        crimeType: "Phishing Campaign",
        status: "ACTIVE",
        threatLevel: "critical",
        occurredAt: "2026-07-01T10:00:00Z",
        confidence: 94,
        entities: {
          phones: ["+91 98765 43210", "+91 99887 76655"],
          emails: ["sbi-support@secure-login.xyz", "admin@fake-verify.in"],
          upis: ["sbi@ybl", "verify-merchant@paytm"],
          bankAccounts: ["100200300400"],
          ips: ["192.0.2.45", "203.0.113.82"],
          devices: ["Android-MUM-892"],
          qrs: ["QR-SBI-991"],
          websites: ["sbi-secure-login.xyz"]
        }
      },
      {
        id: "CYB-A-002",
        title: "Delhi Digital Arrest Scam",
        city: "Delhi",
        state: "Delhi",
        crimeType: "Digital Arrest",
        status: "ACTIVE",
        threatLevel: "high",
        occurredAt: "2026-07-05T14:30:00Z",
        confidence: 88,
        entities: {
          phones: ["+91 98765 43210"],
          emails: ["officer-delhi@police-gov.in"],
          upis: ["court-penalty@okaxis"],
          bankAccounts: [],
          ips: ["203.0.113.82"],
          devices: ["Windows-DEL-332"],
          qrs: [],
          websites: []
        }
      },
      {
        id: "CYB-A-003",
        title: "Pune Instant Loan Phishing",
        city: "Pune",
        state: "Maharashtra",
        crimeType: "UPI Fraud",
        status: "MONITORING",
        threatLevel: "medium",
        occurredAt: "2026-07-10T09:15:00Z",
        confidence: 76,
        entities: {
          phones: [],
          emails: ["admin@fake-verify.in"],
          upis: ["verify-merchant@paytm"],
          bankAccounts: ["100200300400"],
          ips: [],
          devices: ["Android-PUN-041"],
          qrs: [],
          websites: []
        }
      },
      {
        id: "CYB-A-004",
        title: "Bengaluru Part-Time Job Scam",
        city: "Bengaluru",
        state: "Karnataka",
        crimeType: "Identity Theft",
        status: "ACTIVE",
        threatLevel: "high",
        occurredAt: "2026-07-12T11:45:00Z",
        confidence: 85,
        entities: {
          phones: ["+91 99887 76655"],
          emails: [],
          upis: ["part-time-recruit@okicici"],
          bankAccounts: [],
          ips: [],
          devices: [],
          qrs: ["QR-SBI-991"],
          websites: []
        }
      },
      {
        id: "CYB-B-001",
        title: "Kolkata E-Commerce Fraud Ring",
        city: "Kolkata",
        state: "West Bengal",
        crimeType: "Counterfeit Currency",
        status: "ACTIVE",
        threatLevel: "critical",
        occurredAt: "2026-07-02T15:20:00Z",
        confidence: 90,
        entities: {
          phones: ["+91 88990 01122"],
          emails: ["merchant@helios-cards.com"],
          upis: ["helios@paytm"],
          bankAccounts: ["999888777666"],
          ips: ["198.51.100.14"],
          devices: ["Macbook-KOL-022"],
          qrs: [],
          websites: ["helios-shop.com"]
        }
      },
      {
        id: "CYB-B-002",
        title: "Chennai Ransomware Incident",
        city: "Chennai",
        state: "Tamil Nadu",
        crimeType: "Ransomware",
        status: "ACTIVE",
        threatLevel: "critical",
        occurredAt: "2026-07-06T18:10:00Z",
        confidence: 95,
        entities: {
          phones: [],
          emails: ["decrypt@helios-cards.com"],
          upis: [],
          bankAccounts: [],
          ips: ["198.51.100.14"],
          devices: [],
          qrs: [],
          websites: ["helios-shop.com", "ransom-portal.net"]
        }
      },
      {
        id: "CYB-B-003",
        title: "Hyderabad Utility Bill Fraud",
        city: "Hyderabad",
        state: "Telangana",
        crimeType: "UPI Fraud",
        status: "ACTIVE",
        threatLevel: "high",
        occurredAt: "2026-07-11T08:00:00Z",
        confidence: 82,
        entities: {
          phones: ["+91 88990 01122"],
          emails: [],
          upis: ["electric-bill@sbi"],
          bankAccounts: ["999888777666"],
          ips: [],
          devices: [],
          qrs: [],
          websites: []
        }
      },
      {
        id: "CYB-C-001",
        title: "Jaipur Buyer Phishing",
        city: "Jaipur",
        state: "Rajasthan",
        crimeType: "UPI Fraud",
        status: "RESOLVED",
        threatLevel: "medium",
        occurredAt: "2026-07-04T12:00:00Z",
        confidence: 72,
        entities: {
          phones: ["+91 77665 54433"],
          emails: ["olx-pay-refund@gmail.com"],
          upis: ["olx-verify@paytm"],
          bankAccounts: ["444333222111"],
          ips: ["192.0.2.115"],
          devices: ["Android-JAI-102"],
          qrs: [],
          websites: []
        }
      },
      {
        id: "CYB-C-002",
        title: "Ahmedabad Refund Redirect Gateway",
        city: "Ahmedabad",
        state: "Gujarat",
        crimeType: "UPI Fraud",
        status: "MONITORING",
        threatLevel: "medium",
        occurredAt: "2026-07-08T16:45:00Z",
        confidence: 78,
        entities: {
          phones: ["+91 77665 54433"],
          emails: ["olx-pay-refund@gmail.com"],
          upis: [],
          bankAccounts: [],
          ips: [],
          devices: [],
          qrs: [],
          websites: []
        }
      }
    ];

    // Combine database cases and mock cases
    const allCases = [...dbCases, ...mockCases];

    // 3. Entity-based linking Graph analysis
    const entityToCases: Record<string, string[]> = {};
    allCases.forEach((c) => {
      const caseEntities = [
        ...c.entities.phones,
        ...c.entities.emails,
        ...c.entities.upis,
        ...c.entities.bankAccounts,
        ...c.entities.ips,
        ...c.entities.devices,
        ...c.entities.qrs,
        ...c.entities.websites
      ];
      
      caseEntities.forEach((entityVal) => {
        if (!entityToCases[entityVal]) {
          entityToCases[entityVal] = [];
        }
        if (!entityToCases[entityVal].includes(c.id)) {
          entityToCases[entityVal].push(c.id);
        }
      });
    });

    // Build case-to-case adjacency list
    const caseAdjacency: Record<string, Set<string>> = {};
    allCases.forEach((c) => {
      caseAdjacency[c.id] = new Set<string>();
    });

    // Populate adjacency list
    Object.values(entityToCases).forEach((caseIds) => {
      if (caseIds.length > 1) {
        for (let i = 0; i < caseIds.length; i++) {
          for (let j = i + 1; j < caseIds.length; j++) {
            caseAdjacency[caseIds[i]].add(caseIds[j]);
            caseAdjacency[caseIds[j]].add(caseIds[i]);
          }
        }
      }
    });

    // 4. Components solver (Breadth-First Search) to identify connected fraud rings
    const visited = new Set<string>();
    const rings: string[][] = [];

    allCases.forEach((c) => {
      if (!visited.has(c.id)) {
        const component: string[] = [];
        const queue: string[] = [c.id];
        visited.add(c.id);

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          component.push(currentId);

          caseAdjacency[currentId].forEach((neighborId) => {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              queue.push(neighborId);
            }
          });
        }
        rings.push(component);
      }
    });

    // Map of case ID to component index
    const caseToRingIndex: Record<string, number> = {};
    rings.forEach((ringCases, idx) => {
      ringCases.forEach((id) => {
        caseToRingIndex[id] = idx;
      });
    });

    // 5. Generate City Nodes
    const cityNodeMap: Record<string, any> = {};

    allCases.forEach((c) => {
      const city = c.city;
      if (!cityNodeMap[city]) {
        cityNodeMap[city] = {
          id: city,
          city,
          state: c.state,
          casesCount: 0,
          highestThreatLevel: "low",
          riskScore: 0,
          sharedEntitiesCount: 0,
          crimeTypes: new Set<string>(),
          cases: [],
          ringIndex: caseToRingIndex[c.id]
        };
      }

      const node = cityNodeMap[city];
      node.casesCount += 1;
      node.crimeTypes.add(c.crimeType);
      node.cases.push({
        id: c.id,
        title: c.title,
        crimeType: c.crimeType,
        status: c.status,
        threatLevel: c.threatLevel,
        confidence: c.confidence,
        occurredAt: c.occurredAt
      });

      // Update highest threat level
      const threatRanks: Record<string, number> = { "low": 1, "medium": 2, "high": 3, "critical": 4 };
      if (threatRanks[c.threatLevel] > threatRanks[node.highestThreatLevel]) {
        node.highestThreatLevel = c.threatLevel;
      }

      // Risk score calculation based on count and severity
      node.riskScore = Math.min(100, node.riskScore + (c.threatLevel === "critical" ? 30 : c.threatLevel === "high" ? 20 : 10));
    });

    // Convert sets to arrays
    const nodes = Object.values(cityNodeMap).map((n: any) => ({
      ...n,
      crimeTypes: Array.from(n.crimeTypes),
      threatLevel: n.highestThreatLevel
    }));

    // 6. Generate City-to-City Links
    const linksMap: Record<string, any> = {};

    Object.entries(entityToCases).forEach(([entityVal, caseIds]) => {
      if (caseIds.length > 1) {
        // Find all city pairs connecting these cases
        for (let i = 0; i < caseIds.length; i++) {
          for (let j = i + 1; j < caseIds.length; j++) {
            const caseA = allCases.find((x) => x.id === caseIds[i])!;
            const caseB = allCases.find((x) => x.id === caseIds[j])!;
            if (caseA.city !== caseB.city) {
              const sortedCities = [caseA.city, caseB.city].sort();
              const linkKey = `${sortedCities[0]}-${sortedCities[1]}`;

              // Determine entity category/type
              let entityType = "other";
              if (caseA.entities.phones.includes(entityVal)) entityType = "phone";
              else if (caseA.entities.emails.includes(entityVal)) entityType = "email";
              else if (caseA.entities.upis.includes(entityVal)) entityType = "upi";
              else if (caseA.entities.bankAccounts.includes(entityVal)) entityType = "bankAccount";
              else if (caseA.entities.ips.includes(entityVal)) entityType = "ip";
              else if (caseA.entities.devices.includes(entityVal)) entityType = "device";
              else if (caseA.entities.qrs.includes(entityVal)) entityType = "qr";
              else if (caseA.entities.websites.includes(entityVal)) entityType = "website";

              if (!linksMap[linkKey]) {
                linksMap[linkKey] = {
                  id: linkKey,
                  source: sortedCities[0],
                  target: sortedCities[1],
                  strength: 0,
                  sharedEntities: [],
                  ringIndex: caseToRingIndex[caseA.id]
                };
              }

              const link = linksMap[linkKey];
              link.strength += 1;
              if (!link.sharedEntities.some((se: any) => se.value === entityVal)) {
                link.sharedEntities.push({ type: entityType, value: entityVal });
              }
            }
          }
        }
      }
    });

    const links = Object.values(linksMap).map((l: any) => {
      let relationshipType = "weak";
      if (l.strength >= 4) relationshipType = "critical";
      else if (l.strength === 3) relationshipType = "strong";
      else if (l.strength === 2) relationshipType = "medium";

      return {
        ...l,
        relationshipType
      };
    });

    // Count shared entities per node for UI sizing
    nodes.forEach((n) => {
      let totalShared = 0;
      links.forEach((l) => {
        if (l.source === n.id || l.target === n.id) {
          totalShared += l.sharedEntities.length;
        }
      });
      n.sharedEntitiesCount = totalShared;
    });

    // 7. Chronological timeline events
    const sortedTimelineCases = [...allCases].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    const timeline: any[] = [];
    const activeNodes = new Set<string>();
    const activeEdges = new Set<string>();

    sortedTimelineCases.forEach((c) => {
      const addedNode = !activeNodes.has(c.city);
      if (addedNode) activeNodes.add(c.city);

      // Check if new edges are created in this step
      const createdEdges: string[] = [];
      links.forEach((l) => {
        const edgeId = l.id;
        if (!activeEdges.has(edgeId)) {
          // Edge is created if both nodes are active and this case is connected to it
          const isSourceMatch = l.source === c.city && activeNodes.has(l.target);
          const isTargetMatch = l.target === c.city && activeNodes.has(l.source);
          if (isSourceMatch || isTargetMatch) {
            activeEdges.add(edgeId);
            createdEdges.push(edgeId);
          }
        }
      });

      timeline.push({
        timestamp: c.occurredAt,
        type: "incident",
        city: c.city,
        crimeType: c.crimeType,
        caseId: c.id,
        title: c.title,
        description: `New case "${c.title}" identified in ${c.city} (${c.crimeType}).`,
        createdNode: addedNode ? c.city : null,
        createdLinks: createdEdges
      });
    });

    // 8. Dynamic AI analytics
    let mostConnectedCity = "Mumbai";
    let maxConnections = 0;
    const cityConnections: Record<string, number> = {};

    links.forEach((l) => {
      cityConnections[l.source] = (cityConnections[l.source] || 0) + 1;
      cityConnections[l.target] = (cityConnections[l.target] || 0) + 1;
    });

    Object.entries(cityConnections).forEach(([city, count]) => {
      if (count > maxConnections) {
        maxConnections = count;
        mostConnectedCity = city;
      }
    });

    // Find most reused entities
    const entityCounts: Record<string, { val: string; type: string; count: number }> = {};
    Object.entries(entityToCases).forEach(([val, caseIds]) => {
      // Find type
      let type = "other";
      const sampleCase = allCases.find((c) => 
        c.entities.phones.includes(val) || 
        c.entities.emails.includes(val) || 
        c.entities.upis.includes(val) ||
        c.entities.bankAccounts.includes(val) ||
        c.entities.ips.includes(val) ||
        c.entities.devices.includes(val) ||
        c.entities.qrs.includes(val) ||
        c.entities.websites.includes(val)
      );

      if (sampleCase) {
        if (sampleCase.entities.phones.includes(val)) type = "phone";
        else if (sampleCase.entities.emails.includes(val)) type = "email";
        else if (sampleCase.entities.upis.includes(val)) type = "upi";
        else if (sampleCase.entities.bankAccounts.includes(val)) type = "bankAccount";
        else if (sampleCase.entities.ips.includes(val)) type = "ip";
        else if (sampleCase.entities.devices.includes(val)) type = "device";
        else if (sampleCase.entities.qrs.includes(val)) type = "qr";
        else if (sampleCase.entities.websites.includes(val)) type = "website";
      }

      entityCounts[val] = { val, type, count: caseIds.length };
    });

    const getMostReused = (type: string) => {
      const items = Object.values(entityCounts).filter((ec) => ec.type === type);
      if (items.length === 0) return "N/A";
      items.sort((a, b) => b.count - a.count);
      return items[0].count > 1 ? `${items[0].val} (Reused ${items[0].count}x)` : "None Detected";
    };

    // Calculate component statistics (Fraud rings)
    const ringStats = rings.map((ringCases, idx) => {
      const ringCities = new Set<string>();
      const sharedEntities = new Set<string>();
      const sharedTypes = new Set<string>();
      let maxRisk = 0;

      ringCases.forEach((id) => {
        const c = allCases.find((x) => x.id === id)!;
        ringCities.add(c.city);
        maxRisk = Math.max(maxRisk, c.threatLevel === "critical" ? 95 : c.threatLevel === "high" ? 75 : 45);
      });

      // Count entities shared across this ring
      Object.entries(entityToCases).forEach(([entityVal, caseIds]) => {
        const ringOverlaps = caseIds.filter((id) => ringCases.includes(id));
        if (ringOverlaps.length > 1) {
          sharedEntities.add(entityVal);
          // Find entity type
          const c = allCases.find((x) => x.id === ringOverlaps[0])!;
          if (c.entities.phones.includes(entityVal)) sharedTypes.add("phones");
          else if (c.entities.devices.includes(entityVal)) sharedTypes.add("devices");
          else if (c.entities.upis.includes(entityVal)) sharedTypes.add("upis");
          else if (c.entities.bankAccounts.includes(entityVal)) sharedTypes.add("bankAccounts");
          else if (c.entities.emails.includes(entityVal)) sharedTypes.add("emails");
          else if (c.entities.websites.includes(entityVal)) sharedTypes.add("websites");
          else if (c.entities.ips.includes(entityVal)) sharedTypes.add("ips");
        }
      });

      const confidence = Math.min(99, 50 + (sharedTypes.has("phones") ? 15 : 0) + (sharedTypes.has("devices") ? 20 : 0) + (sharedTypes.has("bankAccounts") ? 15 : 0) + sharedEntities.size * 2);

      return {
        index: idx,
        casesCount: ringCases.length,
        cities: Array.from(ringCities),
        sharedEntitiesCount: sharedEntities.size,
        confidence,
        risk: maxRisk
      };
    });

    ringStats.sort((a, b) => b.risk - a.risk);
    const highestRiskCluster = ringStats[0] 
      ? `Ring #${ringStats[0].index + 1} (${ringStats[0].cities.join("-")}) - Risk: ${ringStats[0].risk}%`
      : "No Risk Clusters";

    const aiInsights = {
      relationshipStrength: links.length > 0 ? Math.round(links.reduce((acc, l) => acc + l.strength, 0) / links.length * 10) / 10 : 0,
      fraudRingConfidence: ringStats.length > 0 ? Math.round(ringStats.reduce((acc, r) => acc + r.confidence, 0) / ringStats.length) : 0,
      mostConnectedCity,
      highestRiskCluster,
      mostReusedPhone: getMostReused("phone"),
      mostReusedEmail: getMostReused("email"),
      mostReusedUpi: getMostReused("upi"),
      mostActiveNetwork: ringStats[0] ? `Syndicate Ring #${ringStats[0].index + 1} (${ringStats[0].casesCount} linked cases)` : "N/A"
    };

    // Calculate aggregated states count to satisfy global summary stats structure
    const states = [
      "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
      "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
      "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
      "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
      "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
      "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir"
    ];

    const stateData = states.map((state) => {
      const stateCases = allCases.filter((c) => c.state === state);
      const threats = stateCases.length;
      const reports = stateCases.length;
      const critical = stateCases.filter((c) => c.threatLevel === "critical").length;
      const investigations = stateCases.length;

      let threatLevel = "low";
      if (critical >= 2) threatLevel = "critical";
      else if (threats >= 3) threatLevel = "high";
      else if (threats >= 1) threatLevel = "medium";

      return { state, threats, reports, critical, investigations, threatLevel };
    });

    const totalScans = await prisma.threatScan.count();
    const totalReports = await prisma.threatReport.count();
    const totalEvidence = await prisma.evidenceUpload.count();
    const totalInvestigations = await prisma.incident.count();
    const highRiskScans = await prisma.threatAnalysis.count({ where: { riskLevel: { in: ["HIGH", "CRITICAL"] } } });

    return {
      states: stateData,
      nodes,
      links,
      timeline,
      aiInsights,
      summary: { totalScans, totalReports, totalEvidence, totalInvestigations, highRiskScans }
    };
  },
};
