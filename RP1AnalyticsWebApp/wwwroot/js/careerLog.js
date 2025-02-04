﻿(() => {
    const ContractEventTypes = Object.freeze({ 'Accept': 0, 'Complete': 1, 'Fail': 2, 'Cancel': 3 });
    const MilestonesToShowOnChart = Object.freeze({
        'FirstScienceSat': 'FSO', 'FirstScienceSat-Heavy': 'FSO', 'LunarImpactor': 'Lunar Impactor', 'first_OrbitCrewed': 'Crewed Orbit',
        'first_MoonLandingCrewed': 'Crewed Moon', 'MarsLandingCrew': 'Crewed Mars', 'first_spaceStation': 'Space Station'
    });
    const repToSubsidyConversion = 100;
    const subsidyMultiplierForMax = 2;
    const perYearMinSubsidyArr = Object.freeze([
        25000,
        30000,
        35000,
        40000,
        60000,
        80000,
        100000,
        125000,
        150000,
        200000,
        250000,
        300000,
        375000,
        450000,
        500000,
        550000,
        600000
    ]);
    const yearRepMap = calculateYearRepMap();

    let contractEvents = null;
    let programs = null;
    let hoverCurrentSubplotOnly = false;
    let hoverListenerSetUp = false;

    const app = Vue.createApp({
        data() {
            return {
                careerId: null,
                career: null,
                careerTitle: null,
                careerLogMeta: null,
                isLoadingCareerMeta: false,
                activeTab: 'milestones',
                filters: null
            };
        },
        methods: {
            reset() {
                this.careerId = null;
                this.career = null;
                this.careerLogMeta = null;
                this.isLoadingCareerMeta = false;
                this.careerTitle = null;
                this.filters = null;
            },
            handleChangeActive(tabName) {
                this.activeTab = tabName;
                const url = new URL(window.location);
                url.searchParams.set('tab', tabName);
                window.history.replaceState({}, '', url);
            },
            handleCareerChange(careerId) {
                const url = new URL(window.location);
                url.searchParams.set('careerId', careerId);
                window.history.pushState({}, '', url);
                getCareerLogs(careerId);
            },
            handleFiltersChange(filters) {
                this.filters = filters;
            }
        },
        computed: {
            canEdit() {
                return this.career && currentUser && this.career.userLogin === currentUser.userName;
            }
        },
    });
    app.component('career-select', CareerSelect);
    app.component('selection-tab', SelectionTab);
    app.component('milestone-contracts', MilestoneContracts);
    app.component('repeatable-contracts', RepeatableContracts);
    app.component('tech-unlocks', TechUnlocks);
    app.component('launches', Launches);
    app.component('facilities', Facilities);
    app.component('programs', Programs);
    app.component('leaders', Leaders);
    app.component('loading-spinner', LoadingSpinner);
    app.component('meta-information', MetaInformation);
    const vm = app.mount('#appWrapper');

    const urlParams = new URLSearchParams(window.location.search);
    const initialCareerId = urlParams.get('careerId');
    if (initialCareerId) {
        getCareerLogs(initialCareerId);
    }

    const tabId = urlParams.get('tab');
    if (tabId) {
        vm.activeTab = tabId;
    }

    bindEvents();
    vm.handleFiltersChange(vmFilters.filters);

    function bindEvents() {
        document.addEventListener('keydown', event => {
            hoverCurrentSubplotOnly = event.ctrlKey;
        });
        document.addEventListener('keyup', event => {
            hoverCurrentSubplotOnly = event.ctrlKey;
        });

        window.onpopstate = event => {
            const urlParams = new URLSearchParams(window.location.search);
            const initialCareerId = urlParams.get('careerId');
            if (initialCareerId) {
                getCareerLogs(initialCareerId);
            }
            else {
                vm.reset();
            }

            const tabId = urlParams.get('tab');
            if (tabId) {
                vm.activeTab = tabId;
            }
        }

        window.filtersChanged = filters => {
            vm.handleFiltersChange(filters);
        }
    }

    function getCareerLogs(careerId) {
        console.log(`Getting Logs for ${careerId}...`);

        document.getElementById('chart').classList.toggle('is-invisible', true);

        if (!careerId) {
            contractEvents = null;
            programs = null;
            vm.reset();
        }
        else {
            vm.careerId = careerId;
            vm.isLoadingCareerMeta = true;

            Promise.all([
                fetch(`/api/careerlogs/${careerId}`)
                    .then((res) => res.json())
                    .then((jsonLogs) => {
                        const meta = jsonLogs.careerLogMeta;
                        meta.lastUpdate = jsonLogs.lastUpdate;
                        vm.isLoadingCareerMeta = false;
                        vm.careerLogMeta = meta;
                        vm.careerTitle = jsonLogs.name;
                        vm.career = jsonLogs;
                        return jsonLogs;
                    })
                    .catch((error) => alert(error)),
                fetch(`/api/careerlogs/${careerId}/contracts`)
                    .then((res) => res.json())
                    .then((jsonContracts) => {
                        contractEvents = jsonContracts;
                        return jsonContracts;
                    })
                    .catch((error) => alert(error)),
                fetch(`/api/careerlogs/${careerId}/programs`)
                    .then((res) => res.json())
                    .then((jsonPrograms) => {
                        programs = jsonPrograms;
                        return jsonPrograms;
                    })
                    .catch((error) => alert(error))
            ]).then((values) => drawChart(values[0]))
              .then((chartDrawn) => document.getElementById('chart').classList.toggle('is-invisible', !chartDrawn))
        }
    }

    function getValuesForField(careerLogs, fieldName) {
        let arr = [];
        careerLogs.forEach((entry) => {
            arr.push(entry[fieldName]);
        });

        return arr;
    }

    function getFundsEarned(careerLogs) {
        let totals = [];
        let total = 0;

        careerLogs.forEach((entry) => {
            total += entry.programFunds + entry.otherFundsEarned;
            totals.push(total);
        });

        return totals;
    }

    function getRepCapForPeriods(careerLogs) {
        const arr = [];
        careerLogs.forEach((entry) => {
            const dt = moment.utc(entry.endDate);
            const timestamp = dt.unix();
            let prevKey, prevVal;
            for (const [key, value] of yearRepMap) {
                if (timestamp < key) {
                    const excess = timestamp - prevKey;
                    const range = key - prevKey;
                    const timeInRange = excess / range;
                    const approxRep = lerp(prevVal, value, timeInRange)
                    arr.push(approxRep);
                    return;
                }
                prevKey = key;
                prevVal = value;
            }
            arr.push(prevVal);
        });

        return arr;
    }

    function getCompletionDatesAndIndexesForContracts(careerLog, contracts) {
        let arr = [];
        for (let i = 0; i < careerLog.contractEventEntries.length - 1; i++) {
            let entry = careerLog.contractEventEntries[i];
            if (entry.type === ContractEventTypes.Complete &&
                contracts.find(c => entry.internalName === c) &&
                !arr.find(el => el.contract === entry.internalName)) {

                const dt = moment.utc(entry.date);
                const tmp = getLogPeriodForDate(careerLog.careerLogEntries, dt);
                arr.push({
                    contract: entry.internalName,
                    month: dt.format('YYYY-MM'),
                    index: tmp.index
                });
            }
        }
        return arr;
    }

    function getLogPeriodForDate(periods, dt) {
        const idx = periods.findIndex(c => {
            const dtStart = moment.utc(c.startDate);
            const dtEnd = moment.utc(c.endDate);
            return dt > dtStart && dt <= dtEnd;
        });
        return {
            index: idx,
            el: idx >= 0 ? periods[idx] : null
        };
    }

    function drawChart(careerLog) {
        const careerPeriods = careerLog.careerLogEntries;
        if (!careerPeriods) return false;

        const currentFundsTrace = {
            name: 'Current Funds',
            y: getValuesForField(careerPeriods, 'currentFunds'),
            type: 'scattergl',
            mode: 'lines',
            visible: 'legendonly'
        };
        const earnedFundsTrace = {
            name: 'Earned Funds',
            y: getFundsEarned(careerPeriods),
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'chartreuse'
            }   
        };
        const subsidySizeTrace = {
            name: 'Subsidy size',
            y: getValuesForField(careerPeriods, 'subsidySize'),
            type: 'scattergl',
            mode: 'lines',
            visible: 'legendonly'
        };

        const sciEarnedTrace = {
            name: 'Science Earned',
            y: getValuesForField(careerPeriods, 'scienceEarned'),
            yaxis: 'y2',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'dodgerblue',
            }
        };

        const curSciTrace = {
            name: 'Current Science',
            y: getValuesForField(careerPeriods, 'currentSci'),
            yaxis: 'y2',
            type: 'scattergl',
            mode: 'lines',
            visible: 'legendonly'
        };

        const repTrace = {
            name: 'Reputation',
            y: getValuesForField(careerPeriods, 'reputation'),
            yaxis: 'y3',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'darkorange',
            }
        };

        const repCapTrace = {
            name: 'Reputation cap',
            y: getRepCapForPeriods(careerPeriods),
            yaxis: 'y3',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'darkorange',
                dash: 'dot',
                width: 3
            }
        };

        const confidenceTrace = {
            name: 'Confidence',
            y: getValuesForField(careerPeriods, 'confidence'),
            yaxis: 'y4',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'fuchsia'
            }
        };

        const engineersTrace = {
            name: 'Engineers',
            y: getValuesForField(careerPeriods, 'numEngineers'),
            yaxis: 'y5',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'red'
            }
        }
        const researchersTrace = {
            name: 'Researchers',
            y: getValuesForField(careerPeriods, 'numResearchers'),
            yaxis: 'y5',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'blue'
            }
        }
        const engEffTrace = {
            name: 'Engineer Efficiency',
            y: getValuesForField(careerPeriods, 'efficiencyEngineers'),
            yaxis: 'y6',
            type: 'scattergl',
            mode: 'lines',
            line: {
                color: 'red',
                dash: 'dot'
            }
        }

        // A fake 'trace' for displaying contract status in the hover text.
        const contractsTrace = {
            name: 'Contracts',
            y: 0,
            text: getValuesForField(careerPeriods, 'startDate').map(genContractTooltip),
            hovertemplate: '%{text}',
            type: 'scatter',
            showlegend: false,
            marker: {
                color: '#fff0'
            }
        }

        // A fake 'trace' for displaying program status in the hover text.
        const programsTrace = {
            name: 'Programs',
            y: 0,
            text: getValuesForField(careerPeriods, 'startDate').map(genProgramTooltip),
            hovertemplate: '%{text}',
            type: 'scatter',
            showlegend: false,
            marker: {
                color: '#fff0'
            }
        }

        const traces = [
            earnedFundsTrace,
            currentFundsTrace,
            subsidySizeTrace,
            sciEarnedTrace,
            curSciTrace,
            repTrace,
            repCapTrace,
            confidenceTrace,
            engineersTrace,
            researchersTrace,
            engEffTrace,
            contractsTrace,
            programsTrace
        ];
        traces.forEach(t => {
            t.x = getValuesForField(careerPeriods, 'startDate');
            t.connectgaps = true;
        });

        const layout = {
            hovermode: 'x unified',
            grid: {
                columns: 1,
                subplots: [['xy'], ['xy2'], ['xy3'], ['xy4'], ['xy5']],
                ygap: 0.1
            },
            xaxis: {
                title: 'Date',
                type: 'date',
                autorange: true
            },
            yaxis: {
                title: 'Funds',
                autorange: true,
                type: 'linear',
                hoverformat: '.4s'
            },
            yaxis2: {
                title: 'Science',
                autorange: true,
                type: 'linear',
                hoverformat: '.1f'
            },
            yaxis3: {
                title: 'Reputation',
                autorange: true,
                type: 'linear',
                hoverformat: '.1f'
            },
            yaxis4: {
                title: 'Confidence',
                autorange: true,
                showgrid: false,
                type: 'linear',
                hoverformat: '.1f',
                overlaying: 'y3',
                side: 'right'
            },
            yaxis5: {
                title: 'Personnel',
                autorange: true,
                rangemode: 'nonnegative',
                type: 'linear'
            },
            yaxis6: {
                title: 'Efficiency',
                tickformat: ',.0%',
                hoverformat: ',.1%',
                showgrid: false,
                autorange: true,
                type: 'linear',
                overlaying: 'y5',
                side: 'right'
            },
            font: {
                family: 'Poppins',
                size: 14
            },
            margin: {
                t: 40,
                r: 20,
                b: 200,
                l: 80,
                pad: 4
            }
        };

        const annotations = [];
        const contractNames = Object.keys(MilestonesToShowOnChart);
        const completionArr = getCompletionDatesAndIndexesForContracts(careerLog, contractNames);
        completionArr.forEach(el => annotations.push({
            x: el.month,
            y: getValuesForField(careerPeriods, 'currentFunds')[el.index],
            yref: 'y',
            text: MilestonesToShowOnChart[el.contract],
            arrowhead: 6,
            ax: 0,
            ay: -35
        }));

        careerPeriods.forEach((p, idx) => {
            if (p.numNautsKilled > 0) {
                const dt = moment.utc(p.startDate);
                annotations.push({
                    x: dt.format('YYYY-MM'),
                    y: getValuesForField(careerPeriods, 'reputation')[idx],
                    yref: 'y3',
                    text: '💀',
                    arrowhead: 6,
                    ax: 0,
                    ay: -25
                });
            }
        });

        if (annotations.length > 0) {
            layout.annotations = annotations;
        }

        const config = {
            responsive: true
        };

        const plotDiv = document.querySelector('#chart');
        Plotly.react(plotDiv, traces, layout, config);

        if (!hoverListenerSetUp) {
            // Display hover for all subplots.
            plotDiv.on('plotly_hover', (eventData) => {
                if (hoverCurrentSubplotOnly) return;
                if (eventData.xvals) {
                    Plotly.Fx.hover(
                        plotDiv,
                        { xval: eventData.xvals[0] },
                        ['xy', 'xy2', 'xy3', 'xy4', 'xy5', 'xy6']
                    );
                }
            });
            hoverListenerSetUp = true;
        }

        return true;
    }

    function genContractTooltip(xaxis) {
        const dtStart = moment.utc(xaxis);
        const dtEnd = dtStart.clone().add(1, 'months');
        const complete = contractEvents.filter(c => c.type === ContractEventTypes.Complete &&
            moment.utc(c.date) > dtStart && moment.utc(c.date) <= dtEnd);
        const contractList = genTooltipContractRow('Completed', complete);
        return contractList ? `<span style='font-size:12px;'>${contractList}</span>` : 'N/A';
    };

    function genProgramTooltip(xaxis) {
        const dtStart = moment.utc(xaxis);
        const dtEnd = dtStart.clone().add(1, 'months');
        const completed = programs.filter(p => p.completed && moment.utc(p.completed) > dtStart && moment.utc(p.completed) <= dtEnd);
        const accepted = programs.filter(p => moment.utc(p.accepted) > dtStart && moment.utc(p.accepted) <= dtEnd);

        const programList = genTooltipProgramRow('Completed', completed);
        const programList2 = genTooltipProgramRow('Accepted', accepted);
        return programList || programList2 ? `<span style='font-size:12px;'>${programList}${programList2}</span>` : 'N/A';
    };

    function genTooltipContractRow(title, contracts) {
        const groupedMap = contracts.reduce(
            (entryMap, e) => entryMap.set(e.contractInternalName, [...entryMap.get(e.contractInternalName) || [], e]),
            new Map()
        );

        const res = Array.from(groupedMap.values()).reduce(
            (acc, entry) => acc + '<br>    ' + (entry.length > 1 ? entry.length + "x " : '') + entry[0].contractDisplayName,
            ''
        );
        return res ? `<br><i>${title} :</i>${res}` : '';
    }

    function genTooltipProgramRow(title, programs) {
        const res = programs.reduce(
            (acc, entry) => acc + `<br>    ${entry.title}`,
            ''
        );
        return res ? `<br><i>${title} :</i>${res}` : '';
    }

    function calculateYearRepMap() {
        const yearRepMap = new Map();   // Key is Unix timestamp of the year start; value is rep cap at that point in time
        for (let i = 0; i < perYearMinSubsidyArr.length; i++) {
            const year = 1951 + i;
            const dt = moment({ year: year, month: 1, day: 1 });
            const minSubsidy = perYearMinSubsidyArr[i];
            const maxSubsidy = minSubsidy * subsidyMultiplierForMax;
            yearRepMap.set(dt.unix(), (maxSubsidy - minSubsidy) / repToSubsidyConversion);
        }

        return yearRepMap;
    }

    function lerp(start, end, time) {
        return (1 - time) * start + time * end;
    }
})();
