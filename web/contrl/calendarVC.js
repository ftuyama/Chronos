/*
===========================================================================
            Calendar View Controller using Angular
===========================================================================
*/
var calendarApp = angular.module("calendarApp", ['ngCookies', 'pascalprecht.translate']);


calendarApp.directive('progressbar', function() {
    return { restrict: "E", templateUrl: "progressBar.html" };
});

calendarApp.directive('eventsmenu', function() {
    return {
        restrict: "E",
        templateUrl: "eventsMenu.html",
    };
});

calendarApp.controller("calendarVC", function($scope, $http, $q, $cookies, $compile, $timeout, $translate) {

    // Sets Lang to use
    var userLang = navigator.language || navigator.userLanguage;
    $translate.use(userLang);

    // Variável do form
    $scope.event_form = { summary: '', description: '', group_id: -1, startDate: '', startHour: '', endDate: '', endHour: '' };
    $scope.event_id = $scope.event_group = "";

    // Variável de Calendário e Kanban
    $scope.monthYear = new Date();
    $scope.filterWeek = (new Date()).getWeek();
    $scope.filter = "month";

    // Variáveis de negócio
    $scope.evento = $scope.events = $scope.faceEvents = $scope.groups = {};
    $scope.faceNumber = 0;

    // Variáveis de semáforo
    $scope.busy = $scope.loader = true;
    $scope.request = $scope.loaded = $scope.fbActive =
        $scope.hidePastEvents = $scope.kanbanActive = false;

    // Varíaveis para definir Modal Form
    $scope.dateTime = $scope.create = $scope.edit = $scope.face = false;

    /*
        ===========================================================================
                        Communication between ViewControllers
        ===========================================================================
    */

    /* Comunica com FirebaseVC - abre sideBar */
    $scope.invokeFirebase = function() {
        $("#formModal").css({ "margin-left": "20%" });
        angular.element('#firebaseVC').scope()
            .$emit('firebaseNav', [$scope.event_form, $scope.groups, $scope.evento.id]);
    };

    /* Comunica com FirebaseVC - fecha sideBar */
    $scope.closeFirebase = function() {
        $("#formModal").css({ "margin-left": "0%" });
        angular.element('#firebaseVC').scope().$emit('firebaseNavClose', []);
    };

    /* Comunica com FirebaseVC - deletar evento */
    $scope.deleteFirebase = function() {
        angular.element('#firebaseVC').scope()
            .$emit('firebaseDelete', [$scope.event_form, $scope.groups, $scope.evento.id]);
    };

    /* Comunica com FirebaseVC - atualizar evento */
    $scope.updateStatusFirebase = function(status) {
        angular.element('#firebaseVC').scope()
            .$emit('firebaseUpdateStatus', [status, $scope.groups, $scope.evento]);
    };

    /* Comunica com FirebaseVC - requisita informações */
    $scope.firebaseFetch = function() {
        angular.element('#firebaseVC').scope().$emit('firebaseFetch', []);
    }

    /* Ouve FirebaseVC - recebe informações */
    $scope.$on('firebaseFetched', function(event, data) {
        $scope.translate(data[0], data[1], data[2]);
    });

    /* Ouve FirebaseVC - fecha sideBar */
    $scope.$on('eventModal', function(event, data) {
        $("#formModal").css({ "margin-left": "0%" });
    });

    /* Ouve FirebaseVC - atualiza status */
    $scope.$on('updateStatus', function(event, data) {
        $scope.firebaseFetch();
    });

    /*
        ===========================================================================
                                Tradução de eventos
        ===========================================================================
    */

    /* Traduz os eventos do Firebase */
    $scope.translate = function(firebase, user, statusMap) {
        $.each($scope.events, function(group_id, events) {
            $.each(events, function(event_id, event) {
                try {
                    var group_key = cleanGroup($scope.groups[group_id].id);
                    var event_key = event.id;
                    var user_key = user.id;
                    var status_key = "status";
                    var status = firebase[group_key][event_key][user_key][status_key];
                    $scope.events[group_id][event_id].status = status;
                    $scope.events[group_id][event_id].statusColor = statusMap[status];
                } catch (err) {
                    $scope.events[group_id][event_id].status = "NEW";
                    $scope.events[group_id][event_id].statusColor = "red";
                }
            });
        });
        $scope.resolveFirebase();
    }

    /* Concluí processo de Fetch */
    $scope.resolveFirebase = function() {
        if ($scope.kanbanActive) {
            $scope.create_kanban();
            $scope.display_events();
            if ($scope.busy)
                $scope.resolveFetch();
        } else if ($scope.busy) {
            $scope.resolveFetch();
            $scope.display_events();
        }
        $scope.$apply();
    }

    /* Traduz os eventos do Facebook */
    $scope.translateFace = function(faceEvents) {
        var events = [];
        var now = (new Date()).toISOString()
        faceEvents.forEach(function(event) {
            new_event = {
                'id': event.id || 1,
                'summary': event.name || 'facebook',
                'description': event.description || '',
                'start': { 'dateTime': event.start_time || now },
                'end': { 'dateTime': event.end_time || now }
            };
            if (event.place != undefined)
                if (event.place.location != undefined)
                    $.extend(new_event, new_event, {
                        'location': { lat: event.place.location.latitude, lng: event.place.location.longitude },
                        'address': event.place.location.street + ', ' + event.place.location.city
                    });
            events.push(new_event);
        });
        return events;
    }

    $scope.getDefaultGroup = function() {
        // Returns last used group
        if ($scope.default_group != undefined)
            return $scope.default_group;

        // Returns user group
        var userGroup, userMail = getUserMail($scope.user);
        if (userMail != undefined)
            $scope.groups.forEach(function(group) {
                if (group.id == userMail)
                    userGroup = $scope.groups.indexOf(group);
            });

        // Return first group
        return userGroup || $scope.event_group;
    }

    /*
        ===========================================================================
                                Modal Display Management
        ===========================================================================
    */

    $scope.flashFirebase = function(info, selected_date) {
        if ($scope.fbActive) {
            $scope.newEvent(info, selected_date);
            $scope.invokeFirebase();
        }
    }

    $scope.openModals = function(info, selected_date) {
        $scope.fbActive = false;
        $scope.newEvent(info, selected_date);
        $scope.invokeFirebase();
    }

    $scope.firebaseActive = function() {
        $scope.fbActive = !$scope.fbActive;
    }

    /*
        ===========================================================================
                        Manage user's decisions using Modal
        ===========================================================================
    */

    $scope.newEvent = function(info, selected_date) {
        /*  
         *   Id == 0 -> Event Creation
         *   Id != 0 -> Event Edition
         */
        var group_and_id = info.replace("task", "").split('-');
        $scope.create = $scope.edit = false;
        $scope.event_group = Number(group_and_id[0]);
        $scope.event_id = Number(group_and_id[1]);
        if ($scope.event_id == 666) {
            $scope.create = true;
            $scope.event_form = {
                summary: "",
                description: "",
                startDate: toDateBR(selected_date),
                startHour: "",
                endDate: toDateBR(selected_date),
                endHour: "",
                group_id: $scope.getDefaultGroup()
            };
        } else {
            $scope.edit = true;
            $scope.checkDate();
            $scope.evento = evento = $scope.events[$scope.event_group][$scope.event_id];
            $scope.event_form = {
                summary: evento.summary,
                description: evento.description,
                startDate: toDateBR(getDateProperty(evento.start)),
                startHour: getHourProperty(evento.start),
                endDate: toDateBR(getDateProperty(evento.end)),
                endHour: getHourProperty(evento.end),
                group_id: $scope.event_group
            };
            $scope.fixGoogleBug();
        }
        if ($scope.groupIsFace($scope.event_group)) {
            $scope.edit = false;
            if (evento.location != undefined)
                $.extend($scope.event_form, $scope.event_form, {
                    'location': evento.location,
                    'address': evento.address
                });
        }
        if (!$scope.fbActive)
            $("#formModal").modal('show');
    };

    $scope.fixGoogleBug = function() {
        // Evento de um dia inteiro bugado no Google
        if (getDate($scope.evento.end) - getDate($scope.evento.start) == 1000 * 3600 * 24)
            $scope.event_form.endDate = $scope.event_form.startDate;
    };

    $scope.closeModal = function() {
        // Procura bug de data
        if ($scope.checkDate() == false)
            return false;
        // Fecha modal com dados validados
        $scope.closeFirebase();
        $("#formModal").modal('hide');
        return true;
    };

    /*
        ===========================================================================
                                Manages Move Events
        ===========================================================================
    */

    $scope.move = function(origin, destine) {
        if ($scope.kanbanActive)
            $scope.status_move(origin, destine);
        else $scope.time_move(origin, destine);
    };

    $scope.time_move = function(origin, destine) {
        var group_and_id = origin.replace("task", "").split('-');
        $scope.event_group = Number(group_and_id[0]);
        $scope.event_id = Number(group_and_id[1]);
        var date = destine.replace("day-", "");
        evento = $scope.events[$scope.event_group][$scope.event_id];
        $scope.event_form = {
            summary: evento.summary,
            description: evento.description,
            startDate: date,
            startHour: "",
            endDate: date,
            endHour: "",
            group_id: $scope.event_group
        };
        $scope.postMoveEvent();
        $scope.dateTime = false;
    };

    $scope.status_move = function(origin, destine) {
        var group_and_id = origin.replace("task", "").split('-');
        $scope.event_group = Number(group_and_id[0]);
        $scope.event_id = Number(group_and_id[1]);
        $scope.evento = $scope.events[$scope.event_group][$scope.event_id];
        $scope.evento.group_id = $scope.event_group;
        $scope.updateStatusFirebase(destine);
        if (destine != '') $scope.busy = true;
    };

    /*
        ===========================================================================
                      Generate the POST body for API communication
        ===========================================================================
    */

    $scope.generatePost = function() {
        $scope.default_group = $scope.event_form.group_id;
        return $scope.appendDatePost({
            group_id: $scope.groups[$scope.event_form.group_id].id,
            event: {
                summary: $scope.event_form.summary,
                description: $scope.event_form.description
            }
        });
    };

    $scope.appendDatePost = function(post) {
        if ($scope.dateTime == true) {
            post.event["start"] = { dateTime: toDateISO($scope.event_form.startDate, $scope.event_form.startHour) };
            post.event["end"] = { dateTime: toDateISO($scope.event_form.endDate, $scope.event_form.endHour) };
        } else {
            post.event["start"] = { date: toDateISO($scope.event_form.startDate, "") };
            post.event["end"] = { date: toDateISO($scope.event_form.endDate, "") };
        }
        return post;
    };

    /*
        ===========================================================================
                        Communicating with Nodejs API
        ===========================================================================
    */

    $scope.postCreateEvent = function() {
        if (!$scope.closeModal()) return;
        var post = $scope.generatePost();
        showSnackBar($translate.instant('label.snackbar.event.create.doing'));
        $http.post('/calendar/create', JSON.stringify(post))
            .then(function success(response) {
                showSnackBar($translate.instant('label.snackbar.event.create.done'));
                $scope.display();
            });
    }

    $scope.postEditEvent = function() {
        if (!$scope.closeModal()) return;
        var post = $scope.generatePost();
        post["group_id"] = $scope.groups[$scope.event_group].id;
        post["event_id"] = $scope.events[$scope.event_group][$scope.event_id].id;
        showSnackBar($translate.instant('label.snackbar.event.edit.doing'));
        $http.post('/calendar/edit', JSON.stringify(post))
            .then(function success(response) {
                showSnackBar($translate.instant('label.snackbar.event.edit.done'));
                $scope.display();
            });
    }

    $scope.postDeleteEvent = function() {
        $scope.deleteFirebase();
        if (!$scope.closeModal()) return;
        var param = {
            group_id: $scope.groups[$scope.event_group].id,
            event_id: $scope.events[$scope.event_group][$scope.event_id].id
        };
        showSnackBar($translate.instant('label.snackbar.event.delete.doing'));
        $http.get('/calendar/delete', { "params": param })
            .then(function success(response) {
                showSnackBar($translate.instant('label.snackbar.event.delete.done'));
                $scope.display();
            });
    };

    $scope.postMoveEvent = function() {
        var post = $scope.generatePost();
        post["group_id"] = $scope.groups[$scope.event_group].id;
        post["event_id"] = $scope.events[$scope.event_group][$scope.event_id].id;
        showSnackBar($translate.instant('label.snackbar.event.move.doing'));
        $http.post('/calendar/edit', JSON.stringify(post))
            .then(function success(response) {
                showSnackBar($translate.instant('label.snackbar.event.move.done'));
                $scope.display();
            });
    }

    /*
        ===========================================================================
                            Gerencia grupo do Facebook
        ===========================================================================
    */

    $scope.groupIsFace = function(group) {
        return $scope.groups[group].id == "facebook";
    }

    $scope.groupFace = function() {
        return {
            kind: "calendar#calendarListEntry",
            etag: "\"1477922394544000\"",
            id: "facebook",
            summary: "Facebook",
            description: "Eventos do facebook",
            location: "",
            timeZone: "",
            colorId: "23",
            backgroundColor: "#cd74e6",
            foregroundColor: "#000000",
            selected: true,
            accessRole: "owner",
            defaultReminders: [{ "method": "popup", "minutes": 60 }]
        }
    }

    /*
        ===========================================================================
                        Fetching Data from the Server
        ===========================================================================
    */

    /* Gerencia fila de eventos */
    $scope.requestFetch = function() {
        if (!$scope.busy)
            $scope.fetch();
        else $scope.request = true;
    }

    /* Requisita fetch de facebook */
    $scope.requestFaceFetch = function() {
        if (!$scope.faceCheck) return;
        $scope.busy = true;
        $scope.faceFetch().then(function success(response) {
            $scope.busy = false;
            $scope.$apply();
        }, function error(error) {
            showSnackBar($translate.instant('label.snackbar.facebook.login'));
            $scope.faceCheck = $scope.busy = false;
            $scope.$apply();
        });
    }

    /* Carrega todos os eventos */
    $scope.fetch = function() {
        return new Promise(function(resolve, reject) {
            $scope.busy = true;
            $scope.events = http_requests = [];
            /* Percorre grupos, procurando fetches */
            for (j = 0; j < $scope.groups.length; j++) {
                var group_checked = $scope.groups[j].checked;
                createCookie([$scope.groups[j].id], group_checked, 365);
                $scope.events.push([]);
                if (group_checked == true) {
                    /* Carrega os eventos do grupo */
                    if (!$scope.groupIsFace(j))
                        http_requests.push($http.get('/calendar/list' + j)
                            .then(function success(response) {
                                if (response.data.items.length > 0)
                                    $scope.events[Number(
                                        response.data.group_id)] = response.data.items;
                            }));
                    /* Caso especial do Facebook */
                    else http_requests.push(
                        new Promise(function(resolve, reject) {
                            $http.get('/calendar/facebook')
                                .then(function success(response) {
                                    $scope.events[$scope.faceNumber] =
                                        $scope.translateFace(response.data.data);
                                    resolve();
                                }, function error(error) {
                                    $scope.groups[$scope.faceNumber].checked = false;
                                    showSnackBar($translate.instant('label.snackbar.facebook.login'));
                                    resolve();
                                })
                        }));
                }
            }
            /* Carrega Firebase depois de eventos */
            $q.all(http_requests).then(function() {
                $scope.firebaseFetch();
                resolve();
            });
        });
    };

    /* Termina a carga de todos os eventos */
    $scope.resolveFetch = function() {
        if ($scope.request) {
            $scope.request = false;
            $scope.fetch();
        } else $scope.busy = false;
    }

    /* Inicialmente carrega lista de grupos */
    $http.get('/calendar/groups')
        .then(function success(response) {
            $scope.groups = response.data.items;
            $scope.groups.push($scope.groupFace());
            $scope.faceNumber = $scope.groups.length - 1;
            for (i = 0; i < $scope.groups.length; i++) {
                var cookie = readCookie([$scope.groups[i].id]);
                $scope.groups[i].checked =
                    (cookie == undefined || cookie == "true");
            }
            $scope.busy = false;
            $scope.display_calendar();
        });

    /* Determina o usuário do calendário */
    $.get("/calendarAuth/user", function(user) {
        if (user != undefined && user != "undefined" && user != "null" && user != "")
            $scope.user = user;
    });

    $scope.$watch("busy", function() {
        // Mostra animação bodosa na primeira vez
        if ($scope.loaded == false && $scope.busy == false) {
            $scope.loaded = true;
            $('body').addClass('loaded');

            // Nas demais, só mostra o loader
            $timeout(function() {
                $scope.loader = false;
                $('body').removeClass('loaded');
                $(".loader-section").css("opacity", 0.3);
            }, 1500);

        } else $scope.loader = $scope.busy;
    });

    /*
        ===========================================================================
                                Display events on Calendar
        ===========================================================================
    */

    $scope.display_events = function() {
        if ($scope.kanbanActive)
            $scope.displayKanbanEvents();
        else $scope.displayEvents();
    }

    $scope.displayEvents = function() {
        for (group = 0; group < $scope.groups.length; group++) {
            var events = $scope.events[group];
            for (i = 0; i < events.length; i++) {
                if (isValidEvent(events[i])) {
                    var date = getDateProperty(events[i].start);
                    var clazz = getTextSize(events[i].summary);
                    var event_ref = group + '-' + i;
                    if (events[i].summary.match(/feriado/i) || events[i].summary.match(/holiday/i))
                        $("#day-" + date).css('background-color', '#363');
                    var event_item =
                        '<div class="row rowitens">' +
                        '<a href="#" class="list-group-item' + clazz + '" id="task' +
                        event_ref + '" ng-mouseover="flashFirebase(\'' +
                        event_ref + '\', \'' + date + '\')" ng-click="openModals(\'' +
                        event_ref + '\', \'' + date + '\'); $event.stopPropagation();"' +
                        ' draggable="true" ondragstart="drag(event)">' +
                        events[i].summary +
                        '<span class="label label-info status Cstatus"' +
                        ' style="background-color:{{events[' + group + '][' + i + '].statusColor}}"' +
                        ' ng-bind="events[' + group + '][' + i + '].status"' +
                        ' ng-click="status_move(\'task' + event_ref + '\', \'\'); $event.stopPropagation();">' +
                        '</span></a></div>';
                    $("#" + date).append($compile(event_item)($scope));
                    $("#task" + event_ref).css('color', getRandomColor());
                }
            }
        }
    }

    /*
        ===========================================================================
                                Display events on Kanban
        ===========================================================================
    */

    $scope.hidePast = function() {
        $scope.hidePastEvents = !$scope.hidePastEvents;
        $scope.display();
    }

    function comesFirst(event1, event2) {
        var date1 = getDate(event1.start),
            date2 = getDate(event2.start);
        return date1 < date2 ? -1 : date1 > date2 ? 1 : 0;
    }

    function notOutdated(event) {
        return !$scope.hidePastEvents || getDate(event.start) > Date.now();
    }

    $scope.displayKanbanEvents = function() {
        for (group = 0; group < $scope.groups.length; group++) {
            var orig_events = $scope.events[group];
            var events = [].slice
                .call($scope.events[group])
                .filter(notOutdated)
                .sort(comesFirst);
            for (i = 0; i < events.length; i++) {
                if (isValidEvent(events[i])) {
                    var date = getDate(events[i].start);
                    var dateProp = toDateBR(getDateProperty(events[i].start));
                    if ($scope.filter == "" ||
                        $scope.filter == "month" && date.sameMonthYear($scope.monthYear) ||
                        $scope.filter == "week" && date.sameWeekYear($scope.monthYear, $scope.filterWeek)) {
                        var clazz = getTextSize(events[i].summary);
                        var event_ref = group + '-' + orig_events.indexOf(events[i]);
                        var event_item =
                            '<div class="row rowitens">' +
                            '<a href="#" class="list-group-item' + clazz + '" id="task' +
                            event_ref + '" ng-mouseover="flashFirebase(\'' +
                            event_ref + '\', \'' + dateProp + '\')" ng-click="openModals(\'' +
                            event_ref + '\', \'' + dateProp + '\'); $event.stopPropagation();"' +
                            ' draggable="true" ondragstart="drag(event)">' + events[i].summary +
                            '<span class="label label-info status Cstatus"' +
                            ' style="background-color:{{events[' + group + '][' + i + '].statusColor}}">' +
                            dateProp + '</span></a></div><hr>';
                        if ($("#" + events[i].status).length)
                            $("#" + events[i].status).append($compile(event_item)($scope));
                        else $("#NEW").append($compile(event_item)($scope));
                        $("#task" + event_ref).css('color', getRandomColor());
                    }
                }
            }
        }
    }

    /*
        ===========================================================================
                        Auxialiary functions in javascript
        ===========================================================================
    */

    $scope.monthPicker = function() {
        $("#monthPicker").focus();
    };

    /* Resolve bug irritante do AngularJS. Valida também as datas e seu formato */
    $scope.checkDate = function() {
        $scope.event_form.startDate = $("#startDate").val();
        $scope.event_form.endDate = $("#endDate").val();
        if ($("#startHour").val() != "") {
            digits = $("#startHour").val().split(":");
            $scope.event_form.startHour = ("0" + digits[0]).slice(-2) + ":" + digits[1].slice(0, 2);
        }
        if ($("#endHour").val() != "") {
            digits = $("#endHour").val().split(":");
            $scope.event_form.endHour = ("0" + digits[0]).slice(-2) + ":" + digits[1].slice(0, 2);
        }
        date1 = new Date(toDateISO($scope.event_form.startDate, $scope.event_form.startHour));
        date2 = new Date(toDateISO($scope.event_form.endDate, $scope.event_form.endHour));
        if (date1 > date2) {
            $scope.event_form.startDate = $scope.event_form.startHour = "";
            $scope.event_form.endDate = $scope.event_form.endHour = "";
            $scope.dateTime = false;
            return false;
        }
        if ($scope.event_form.startHour != "" || $scope.event_form.endHour != "")
            $scope.dateTime = true;
        else $scope.dateTime = false;
        return true;
    };

    function isValidEvent(event) {
        return event != undefined && event.summary != undefined && event.start != undefined;
    }

    function toDateISO(date, hour) {
        if (date[4] == '-' && date[7] == '-')
            return date;
        var dateISO = date.slice(6, 10) + '-' + date.slice(3, 5) + '-' + date.slice(0, 2);
        if (hour.length < 5)
            return dateISO;
        return dateISO + 'T' + hour.slice(0, 5) + hourTimezoneDiff();
    }

    function toDateBR(date) {
        return date.slice(8, 10) + '/' + date.slice(5, 7) + '/' + date.slice(0, 4);
    }

    function getTextSize(text) {
        if (text == undefined)
            return "";
        if (text.length > 40) return " item-micro";
        else if (text.length > 18) return " item-tiny";
        else if (text.length > 10) return " item-small";
        else return "";
    }

    function getDate(eventDate) {
        if (eventDate.date != undefined)
            return new Date(eventDate.date);
        else if (eventDate.dateTime != undefined)
            return new Date(eventDate.dateTime);
        return new Date();
    }

    function getDateProperty(eventDate) {
        if (eventDate != undefined) {
            if (eventDate.date != undefined)
                return eventDate.date.split('T')[0];
            else if (eventDate.dateTime != undefined)
                return eventDate.dateTime.split('T')[0];
        }
        return (new Date()).toISOString().split('T')[0];
    }

    function getHourProperty(eventDate) {
        if (eventDate != undefined && eventDate.dateTime != undefined)
            return eventDate.dateTime.slice(11, 16);
        return "";
    }

    /*
        ===========================================================================
                                Menu Button Functionalities
        ===========================================================================
    */
    $scope.stopPropagation = function() {
        $event.stopPropagation();
    };

    $scope.fullscreen = function() {
        $("#motherTable").css({
            "background-color": "#111",
            "height": (screenfull.isFullscreen) ? "" : "100%",
            "width": (screenfull.isFullscreen) ? "" : "100%",
            "overflow": "auto"
        });
        screenfull.toggle($("#motherTable")[0]);
    };

    $scope.fullscreenImg = function() {
        $("#coverImg").css({
            "top": (screenfull.isFullscreen) ? "0px" : "initial",
            "height": (screenfull.isFullscreen) ? "20%" : "auto"
        });
        screenfull.toggle($("#coverImg")[0]);
    };

    $scope.select_month = function() {
        [month, year] = $("#monthPicker").val().split(' ');
        $scope.monthYear = new Date(year, returnMonth(month), 1);
        if ($scope.kanbanActive)
            $scope.display_kanban();
        else $scope.display_calendar();
    };

    /*
         ===========================================================================
                           Display Structures Functions
        ===========================================================================
    */

    $scope.display = function() {
        if ($scope.kanbanActive)
            $scope.display_kanban();
        else $scope.display_calendar();
    }

    $scope.display_calendar = function() {
        $scope.kanbanActive = false;
        $scope.create_calendar();
        $scope.requestFetch();
    }

    $scope.display_kanban = function() {
        $scope.kanbanActive = true;
        $scope.create_kanban();
        $scope.requestFetch();
    }

    /*
        ===========================================================================
                        Generating basic calendar structure
        ===========================================================================
    */

    $scope.create_calendar = function() {
        // Hoje
        var date = $scope.monthYear;
        // Data do dia do calendário
        var dayDate;
        // Primeiro dia do mês
        var firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDate();
        // Último dia do mês
        var lastDay = new Date(date.getFullYear(), (date.getMonth() + 1) % 12, 0).getDate();
        // Dia da semana do primeiro dia
        var firstWeekDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
        // Quantos dias teve último mês
        var lastDayOfLastMonth = new Date(date.getFullYear(), date.getMonth(), 0).getDate();

        var table = menuHTML(date, lastDay, "calendar") + "<tr>";

        daysNames.forEach(function(dayName) { table += "<td>" + dayName + "</td>"; });
        table += "</tr>";
        for (i = 0; i <= 5; i++) {
            var row = "<tr>";
            for (j = 0; j <= 6; j++) {
                var dayNumber = ((i * 7 + j - firstWeekDay) % lastDay + 1);
                var dayOut = true;
                if ((i * 7 + j - firstWeekDay) >= lastDay) {
                    // Dia pertence ao próximo mês
                    dayDate = new Date(date.getFullYear(), date.getMonth() + 1, dayNumber);
                } else if (dayNumber <= 0) {
                    // Dia pertence ao mês passado
                    dayNumber += lastDayOfLastMonth;
                    dayDate = new Date(date.getFullYear(), date.getMonth() - 1, dayNumber);
                } else {
                    // Dia pertence ao mês atual
                    dayOut = false;
                    dayDate = new Date(date.getFullYear(), date.getMonth(), dayNumber);
                }
                var dayString = dayNumber.toString();
                var dateString = dayDate.toISOString().split('T')[0];
                row += '<td id="day-' + dateString + '" class="day';
                if (dayDate.sameDay(date))
                    row += " today";
                else if (dayDate < date || dayOut == true)
                    row += " day-gone";
                row += '" ng-click="newEvent(\'0-666\', \'' + dateString +
                    '\')" ondrop="drop(event)" ondragover="allowDrop(event)">' +
                    '<div id="' + dateString + '" class="list-group">' +
                    '<a href="#" class="list-group-item-esp">' + dayString + '</a>';

                row += '<button class="btn btn-success spc-btn" ng-click="createEvent(\'' +
                    dateString + '\')">Add  <span class="glyphicon glyphicon-plus-sign"></span>' +
                    '</button>';

                row += '<button class="btn btn-danger spc-btn" ng-click="deleteAllEvents(\'' +
                    dateString + '\')">Del  <span class="glyphicon glyphicon-minus-sign"></span>' +
                    '</button>';

                row += '</div></td>';
            }
            table += row + "</tr>";
        }
        table += "</table>";
        $scope.calendarHTML = table;
        $("#motherTable").html($compile(table)($scope));
    }

    /*
        ===========================================================================
                        Generating basic kanban structure
        ===========================================================================
    */

    $scope.create_kanban = function() {
        // Hoje
        var date = $scope.monthYear;
        // Último dia do mês
        var lastDay = new Date(date.getFullYear(), (date.getMonth() + 1) % 12, 0).getDate();

        // Lista de Status do Kanban
        var status_list = ["NEW", "TODO", "DEV", "TEST", "DONE"];

        var kanban = menuHTML(date, lastDay, "kanban");

        status_list.forEach(function(status) { kanban += '<td>' + status + '</td>'; });
        kanban += '</tr><tr>';
        status_list.forEach(function(status) {
            kanban += '<td id="' + status + '" ng-click="newEvent(\'0-666\', \'' + date.toISOString().split('T')[0] +
                '\')" ondrop="drop(event)" ondragover="allowDrop(event)"></td>';
        });
        kanban += '</tr></table>';

        $scope.kanbanHTML = kanban;
        $("#motherTable").html($compile(kanban)($scope));
    }

    /*
         ===========================================================================
                                Auxialliary Structures
        ===========================================================================
    */

    function menuHTML(date, lastDay, type) {
        $scope.kanbanFilter = (type == "kanban");
        $scope.monthYearLabel = monthNames[date.getMonth()] + " " + date.getFullYear();
        $scope.progress = Math.round(1000 * date.getDate() / lastDay) / 10;

        return '<progressbar/>' +
            '<table id="' + type + '" class="table table-bordered">' +
            '<tr><td COLSPAN=7 ng-click="monthPicker()"><eventsmenu/></td></tr>';
    }

    // Because Jquery never fails, angular does. 
    $scope.change_filter = function() {
        $scope.filter = $("#filterSelect").val();
        $scope.filterWeek = Number($("#filterWeekSelect").val());
        $scope.display_kanban();
    }

    /* 
        =========================================================================== 
                                Keyboard events 
        =========================================================================== 
    */
    /* Closes modal forcing default action */
    $scope.enterKey = function() {
        if (!$("#formModal").hasClass('in'))
            $scope.newEvent("0-666", ($scope.monthYear).toISOString());
        else {
            if ($scope.create) $scope.postCreateEvent();
            if ($scope.edit) $scope.postEditEvent();
            $scope.closeFirebase();
            $("#formModal").modal('hide');
        }
    }
});

/*
===========================================================================
                View Events triggering controller behaviors
===========================================================================
*/

/* Comportamento drag and drop */

var origin;
var destine;

function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    origin = ev.target.id;
}

function drop(ev) {
    ev.preventDefault();
    destine = ev.target.id;
    angular.element(document.getElementById('calendarVC')).scope().move(origin, destine);
}

/* Detecção de comandos no teclado */
$(document).keyup(function(e) {
    /* Detecta Esc para sair de FullScreen*/
    if (e.keyCode == 27) {
        $("#motherTable").css({
            "background-color": "#111",
            "height": "100%",
            "width": "100%",
            "overflow": "auto"
        });
        $("#coverImg").css({
            "top": "0px",
            "height": "20%"
        });
        screenfull.exit($("#motherTable")[0]);
        screenfull.exit($("#coverImg")[0]);
        angular.element(document.getElementById('calendarVC'))
            .scope().closeModal();
    } else if (e.keyCode == 13) {
        angular.element(document.getElementById('calendarVC'))
            .scope().enterKey();
    }
});

/*
 * Facebook
 */

window.fbAsyncInit = function() {
    FB.init({
        appId: '1321278234570954',
        xfbml: true,
        version: 'v2.8'
    });
    // Facebook Analytics
    FB.AppEvents.logEvent("calendar");
};

(function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) { return; }
    js = d.createElement(s);
    js.id = id;
    js.src = "//connect.facebook.net/en_US/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

/*
 * Google Analytics
 */
(function(i, s, o, g, r, a, m) {
    i['GoogleAnalyticsObject'] = r;
    i[r] = i[r] || function() {
        (i[r].q = i[r].q || []).push(arguments)
    }, i[r].l = 1 * new Date();
    a = s.createElement(o),
        m = s.getElementsByTagName(o)[0];
    a.async = 1;
    a.src = g;
    m.parentNode.insertBefore(a, m)
})(window, document, 'script', '/js/analytics.js', 'ga');

ga('create', 'UA-60506552-2', 'auto');
ga('send', 'pageview');